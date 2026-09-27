import { inject, optional } from "inversify";

import { config } from "../../config";
import { Injectable, SignedUrlOptions, STORAGE_ROUTE_PREFIX } from "../../core";
import { encodeKeyPath } from "./storage-key";
import {
  deriveSigningKey,
  expiryFor,
  ISignedUrlParams,
  signedQuery,
  TSignedMethod,
  verifySignedQuery,
} from "./storage-signature";

/** Переопределение настроек подписи (тесты); по умолчанию — из `config`. */
export const STORAGE_SIGNER_OPTIONS = Symbol("StorageSignerOptions");

export interface IStorageSignerOptions {
  /** Секрет приложения; ключ подписи выводится из него. */
  secret: string;
  /** Публичный адрес API, на который указывают ссылки. */
  publicUrl: string;
  /** Срок ссылки по умолчанию, секунд. */
  ttlSeconds: number;
}

/**
 * Параметры подписанной ссылки на запись. `contentLength` — точный размер:
 * больше не примут, меньше — отклонят по завершении загрузки.
 */
export interface ISignedPutUrlOptions extends SignedUrlOptions {
  contentType?: string;
  contentLength?: number;
}

const defaultOptions = (): IStorageSignerOptions => ({
  secret: config.auth.jwt.secretKey,
  publicUrl: config.app.publicUrl,
  ttlSeconds: config.storage.signedUrlTtlSeconds,
});

/**
 * HMAC-подпись ссылок `GET|PUT /files/<key>?exp&sig`: раздача и прямая
 * загрузка без авторизации по заголовку. Используется драйвером local;
 * маршрут раздачи проверяет подпись тем же ключом.
 */
@Injectable()
export class StorageUrlSigner {
  private readonly _key: Buffer;
  private readonly _options: IStorageSignerOptions;

  constructor(
    @inject(STORAGE_SIGNER_OPTIONS)
    @optional()
    options?: IStorageSignerOptions,
  ) {
    this._options = options ?? defaultOptions();
    this._key = deriveSigningKey(this._options.secret);
  }

  getUrl(key: string, options: SignedUrlOptions = {}): string {
    return this._url({
      method: "GET",
      key,
      exp: expiryFor(options.ttlSeconds ?? this._options.ttlSeconds),
      dl: options.downloadName,
    });
  }

  putUrl(key: string, options: ISignedPutUrlOptions = {}): string {
    return this._url({
      method: "PUT",
      key,
      exp: expiryFor(options.ttlSeconds ?? this._options.ttlSeconds),
      ct: options.contentType,
      len: options.contentLength,
    });
  }

  /** Проверка подписи входящего запроса; ошибки — `StorageError`. */
  verify(
    method: TSignedMethod,
    key: string,
    query: Record<string, unknown>,
  ): ISignedUrlParams {
    return verifySignedQuery(this._key, method, key, query);
  }

  private _url(params: ISignedUrlParams): string {
    const base = this._options.publicUrl.replace(/\/+$/, "");

    return `${base}${STORAGE_ROUTE_PREFIX}/${encodeKeyPath(params.key)}?${signedQuery(this._key, params)}`;
  }
}
