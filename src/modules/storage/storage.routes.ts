import KoaRouter from "@koa/router";
import { inject } from "inversify";
import type { Context } from "koa";
import { Transform } from "stream";

import {
  FileStorage,
  Injectable,
  IRouteProvider,
  STORAGE_ROUTE_PREFIX,
} from "../../core";
import { sendStoredFile } from "./send-stored-file";
import { StorageError } from "./storage.errors";
import { decodeKeyPath } from "./storage-key";
import { StorageUrlSigner } from "./storage-url.signer";

/** Предел загрузки по подписи без заданного `len`. */
export const SIGNED_PUT_MAX_BYTES = 5 * 1024 ** 3;

/** Ключ из пути запроса после префикса. */
const keyFromPath = (ctx: Context): string =>
  decodeKeyPath(ctx.path.slice(STORAGE_ROUTE_PREFIX.length + 1));

const mediaType = (header: string) => header.split(";")[0].trim().toLowerCase();

/** Пропускает не больше `limit` байт, иначе — `STORAGE_TOO_LARGE`. */
const byteLimit = (limit: number) => {
  let total = 0;

  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      callback(total > limit ? StorageError.TOO_LARGE() : null, chunk);
    },
  });
};

/**
 * Раздача и приём файлов по HMAC-подписанным ссылкам драйвера local:
 * `GET|HEAD /files/<key>?exp&sig[&dl]` и `PUT /files/<key>?exp&sig[&ct][&len]`.
 */
@Injectable()
export class StorageRouteProvider implements IRouteProvider {
  constructor(
    @inject(FileStorage) private readonly _storage: FileStorage,
    @inject(StorageUrlSigner) private readonly _signer: StorageUrlSigner,
  ) {}

  register(router: KoaRouter): void {
    const pattern = `${STORAGE_ROUTE_PREFIX}/*key`;

    router.get(pattern, ctx => this._serve(ctx));
    router.put(pattern, ctx => this._receive(ctx));
  }

  private async _serve(ctx: Context): Promise<void> {
    const key = keyFromPath(ctx);
    const { exp, dl } = this._signer.verify("GET", key, ctx.query);
    const maxAge = Math.max(0, exp - Math.floor(Date.now() / 1000));

    await sendStoredFile(ctx, this._storage, key, {
      disposition: dl === undefined ? "auto" : "attachment",
      fileName: dl,
      cacheControl: `private, max-age=${maxAge}`,
    });
  }

  private async _receive(ctx: Context): Promise<void> {
    const key = keyFromPath(ctx);
    const { ct, len } = this._signer.verify("PUT", key, ctx.query);
    const contentType = ctx.get("Content-Type");

    if (ct !== undefined && mediaType(contentType) !== mediaType(ct)) {
      throw StorageError.CONTENT_TYPE_MISMATCH();
    }

    const declared = Number(ctx.get("Content-Length") || NaN);
    const limit = len ?? SIGNED_PUT_MAX_BYTES;

    if (declared > limit) throw StorageError.TOO_LARGE();

    const body = byteLimit(limit);

    // Ошибка лимита может случиться до того, как драйвер подпишется на поток;
    // драйвер всё равно получит её из состояния потока.
    body.on("error", () => undefined);

    const stored = await this._storage.put(key, ctx.req.pipe(body), {
      contentType: ct ?? (contentType || undefined),
    });

    if (len !== undefined && stored.size !== len) {
      await this._storage.delete(key);
      throw StorageError.SIZE_MISMATCH();
    }

    if (stored.etag) ctx.set("ETag", stored.etag);
    ctx.status = 204;
  }
}
