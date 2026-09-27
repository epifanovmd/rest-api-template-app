import { createHmac, timingSafeEqual } from "crypto";

import { StorageError } from "./storage.errors";

/** Доменная метка: ключ подписи ссылок не совпадает с ключом JWT. */
const SIGNING_KEY_LABEL = "storage:signed-url:v1";
/**
 * Срок округляется вверх до корзины: ссылки на один объект в пределах
 * корзины совпадают, и браузер берёт файл из кэша.
 */
const EXPIRY_BUCKET_SECONDS = 300;

export type TSignedMethod = "GET" | "PUT";

/** Параметры подписанной ссылки; все попадают в подпись. */
export interface ISignedUrlParams {
  method: TSignedMethod;
  key: string;
  /** Unix-время истечения, секунд. */
  exp: number;
  /** Имя для скачивания (`Content-Disposition: attachment`). */
  dl?: string;
  /** Обязательный `Content-Type` загрузки (PUT). */
  ct?: string;
  /** Точный размер загрузки, байт (PUT). */
  len?: number;
}

/** Ключ подписи, выведенный из секрета приложения с доменной меткой. */
export const deriveSigningKey = (secret: string): Buffer =>
  createHmac("sha256", secret).update(SIGNING_KEY_LABEL).digest();

const payload = ({ method, key, exp, dl, ct, len }: ISignedUrlParams) =>
  [method, key, exp, dl ?? "", ct ?? "", len ?? ""].join("\n");

export const computeSignature = (
  signingKey: Buffer,
  params: ISignedUrlParams,
): string =>
  createHmac("sha256", signingKey).update(payload(params)).digest("base64url");

/** Unix-время истечения ссылки со сроком `ttlSeconds`. */
export const expiryFor = (ttlSeconds: number, now = Date.now()): number => {
  const exp = Math.floor(now / 1000) + ttlSeconds;

  return ttlSeconds >= EXPIRY_BUCKET_SECONDS * 2
    ? Math.ceil(exp / EXPIRY_BUCKET_SECONDS) * EXPIRY_BUCKET_SECONDS
    : exp;
};

/** Query-строка подписанной ссылки (без `?`). */
export const signedQuery = (
  signingKey: Buffer,
  params: ISignedUrlParams,
): string => {
  const query = new URLSearchParams({ exp: String(params.exp) });

  if (params.dl !== undefined) query.set("dl", params.dl);
  if (params.ct !== undefined) query.set("ct", params.ct);
  if (params.len !== undefined) query.set("len", String(params.len));
  query.set("sig", computeSignature(signingKey, params));

  return query.toString();
};

const single = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/**
 * Проверка подписи запроса. Возвращает параметры ссылки; просрочена —
 * `STORAGE_URL_EXPIRED`, подделана или неполна — `STORAGE_SIGNATURE_INVALID`.
 */
export const verifySignedQuery = (
  signingKey: Buffer,
  method: TSignedMethod,
  key: string,
  query: Record<string, unknown>,
  now = Date.now(),
): ISignedUrlParams => {
  const exp = Number(single(query.exp));
  const sig = single(query.sig);
  const lenRaw = single(query.len);
  const len = lenRaw === undefined ? undefined : Number(lenRaw);

  if (
    !sig ||
    !Number.isInteger(exp) ||
    (len !== undefined && !(Number.isInteger(len) && len >= 0))
  ) {
    throw StorageError.SIGNATURE_INVALID();
  }

  const params: ISignedUrlParams = {
    method,
    key,
    exp,
    dl: single(query.dl),
    ct: single(query.ct),
    len,
  };
  const expected = Buffer.from(computeSignature(signingKey, params));
  const actual = Buffer.from(sig);

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw StorageError.SIGNATURE_INVALID();
  }

  if (exp * 1000 < now) throw StorageError.URL_EXPIRED();

  return params;
};
