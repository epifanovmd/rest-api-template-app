import { randomUUID } from "crypto";
import { createWriteStream } from "fs";
import fs from "fs/promises";
import { inject, optional } from "inversify";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

import { config } from "../../config";
import {
  FileStorage,
  Injectable,
  PutOptions,
  SignedUrlOptions,
  StorageBody,
  StoredObject,
} from "../../core";
import { StorageError } from "./storage.errors";
import { keySegments, prefixSegments } from "./storage-key";
import { ISignedPutUrlOptions, StorageUrlSigner } from "./storage-url.signer";

/** Переопределение каталога драйвера local (тесты); по умолчанию — из `config`. */
export const LOCAL_STORAGE_ROOT = Symbol("LocalStorageRoot");

/** Служебные каталоги корня: недоступны по ключам (скрытые сегменты запрещены). */
const TMP_DIR = ".tmp";
const META_DIR = ".meta";

interface IObjectMeta {
  contentType?: string;
  contentDisposition?: string;
}

const isNotFound = (err: unknown) =>
  (err as NodeJS.ErrnoException).code === "ENOENT";

const readMeta = async (metaPath: string): Promise<IObjectMeta> => {
  try {
    return JSON.parse(await fs.readFile(metaPath, "utf8")) as IObjectMeta;
  } catch {
    return {};
  }
};

/**
 * Драйвер local: объекты — файлы в `STORAGE_LOCAL_PATH`, метаданные (тип,
 * disposition) — рядом в `.meta/`. Запись атомарна: во временный файл того
 * же тома, затем `rename`. Ссылки подписываются HMAC и обслуживаются
 * маршрутом `/files/*` модуля storage.
 */
@Injectable()
export class LocalFileStorage extends FileStorage {
  private readonly _root: string;

  constructor(
    @inject(StorageUrlSigner) private readonly _signer: StorageUrlSigner,
    @inject(LOCAL_STORAGE_ROOT) @optional() root?: string,
  ) {
    super();
    this._root = path.resolve(root ?? config.storage.localPath);
  }

  async put(
    key: string,
    body: StorageBody,
    options: PutOptions = {},
  ): Promise<StoredObject> {
    const target = this._resolve(key);
    const tmp = await this._tmpPath();

    try {
      await this._writeTmp(tmp, body);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.rename(tmp, target);
    } catch (err) {
      await fs.rm(tmp, { force: true });
      throw err;
    }

    await this._writeMeta(key, {
      contentType: options.contentType,
      contentDisposition: options.contentDisposition,
    });

    const stored = await this.stat(key);

    if (!stored) throw StorageError.NOT_FOUND();

    return stored;
  }

  async get(
    key: string,
    range?: { start: number; end?: number },
  ): Promise<Readable> {
    const filePath = this._resolve(key);
    const handle = await fs.open(filePath, "r").catch((err: unknown) => {
      throw isNotFound(err) ? StorageError.NOT_FOUND() : err;
    });

    return handle.createReadStream({ start: range?.start, end: range?.end });
  }

  async stat(key: string): Promise<StoredObject | null> {
    const filePath = this._resolve(key);

    try {
      const stats = await fs.stat(filePath);

      if (!stats.isFile()) return null;

      const meta = await readMeta(this._metaPath(key));

      return {
        size: stats.size,
        contentType: meta.contentType,
        etag: `"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`,
        lastModified: stats.mtime,
      };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this._resolve(key), { force: true });
    await fs.rm(this._metaPath(key), { force: true });
  }

  async deletePrefix(prefix: string): Promise<void> {
    const segments = prefixSegments(prefix);
    const isFolder = prefix.endsWith("/");
    const dirSegments = isFolder ? segments : segments.slice(0, -1);
    const namePrefix = isFolder ? null : segments[segments.length - 1];

    await Promise.all(
      [this._root, path.join(this._root, META_DIR)].map(async base => {
        const dir = path.join(base, ...dirSegments);

        if (namePrefix === null) {
          await fs.rm(dir, { recursive: true, force: true });

          return;
        }

        const names = await fs.readdir(dir).catch((err: unknown) => {
          if (isNotFound(err)) return [];
          throw err;
        });

        await Promise.all(
          names
            .filter(name => name.startsWith(namePrefix))
            .map(name =>
              fs.rm(path.join(dir, name), { recursive: true, force: true }),
            ),
        );
      }),
    );
  }

  async signedGetUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    return this._signer.getUrl(key, options);
  }

  async signedPutUrl(
    key: string,
    options?: ISignedPutUrlOptions,
  ): Promise<string> {
    return this._signer.putUrl(key, options);
  }

  /** Путь к самому объекту, без копии: `fn` не должна его изменять. */
  async withLocalFile<R>(
    key: string,
    fn: (path: string) => Promise<R>,
  ): Promise<R> {
    if (!(await this.stat(key))) throw StorageError.NOT_FOUND();

    return fn(this._resolve(key));
  }

  /** Абсолютный путь объекта; выход за корень — `STORAGE_INVALID_KEY`. */
  private _resolve(key: string): string {
    const resolved = path.resolve(this._root, ...keySegments(key));

    if (!resolved.startsWith(this._root + path.sep)) {
      throw StorageError.INVALID_KEY();
    }

    return resolved;
  }

  private _metaPath(key: string): string {
    return path.join(
      this._root,
      META_DIR,
      `${keySegments(key).join("/")}.json`,
    );
  }

  private async _tmpPath(): Promise<string> {
    const dir = path.join(this._root, TMP_DIR);

    await fs.mkdir(dir, { recursive: true });

    return path.join(dir, randomUUID());
  }

  private async _writeTmp(tmp: string, body: StorageBody): Promise<void> {
    if (Buffer.isBuffer(body)) {
      await fs.writeFile(tmp, body);
    } else if (body instanceof Readable) {
      await pipeline(body, createWriteStream(tmp));
    } else {
      await fs.copyFile(body.path, tmp);
    }
  }

  private async _writeMeta(key: string, meta: IObjectMeta): Promise<void> {
    const metaPath = this._metaPath(key);
    const tmp = await this._tmpPath();

    await fs.mkdir(path.dirname(metaPath), { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(meta));
    await fs.rename(tmp, metaPath);
  }
}
