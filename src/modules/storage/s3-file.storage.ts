import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream, createWriteStream } from "fs";
import fs from "fs/promises";
import { inject, optional } from "inversify";
import os from "os";
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
import { assertValidKey, prefixSegments } from "./storage-key";
import { ISignedPutUrlOptions } from "./storage-url.signer";

/** Переопределение настроек драйвера s3 (тесты); по умолчанию — из `config`. */
export const S3_STORAGE_OPTIONS = Symbol("S3StorageOptions");

export interface IS3StorageOptions {
  bucket: string;
  region: string;
  endpoint?: string;
  /**
   * Адрес хранилища для клиентов: им подписываются ссылки. Нужен, когда API
   * ходит в S3 по внутреннему адресу (`http://s3:8333` в compose), а клиенты —
   * по публичному (`https://files.example.com`). Пусто — `endpoint`.
   */
  publicEndpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Адресация `endpoint/bucket/key` — нужна MinIO. */
  forcePathStyle: boolean;
  /** Срок подписанных ссылок по умолчанию, секунд. */
  ttlSeconds: number;
}

/** Ключей в одном `DeleteObjects` — предел S3. */
const DELETE_BATCH = 1000;

const defaultOptions = (): IS3StorageOptions => ({
  ...config.storage.s3,
  ttlSeconds: config.storage.signedUrlTtlSeconds,
});

const isNotFound = (err: unknown) =>
  err instanceof S3ServiceException &&
  (err.name === "NotFound" ||
    err.name === "NoSuchKey" ||
    err.$metadata.httpStatusCode === 404);

const contentDisposition = (name: string) =>
  `attachment; filename*=UTF-8''${encodeURIComponent(name)}`;

/** Временный каталог процесса; удаляется вместе с содержимым. */
const withTmpDir = async <R>(fn: (dir: string) => Promise<R>): Promise<R> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "s3-storage-"));

  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
};

/**
 * Драйвер s3: AWS S3 и совместимые (MinIO, Yandex, Selectel). Ссылки —
 * presigned URL самого хранилища, трафик файлов мимо API. Поток без
 * известной длины сначала пишется во временный файл: `PutObject` требует
 * `Content-Length` (multipart-загрузка — через `@aws-sdk/lib-storage`).
 */
@Injectable()
export class S3FileStorage extends FileStorage {
  private readonly _client: S3Client;
  /** Клиент для подписи ссылок: публичный адрес. Сетевых запросов не делает. */
  private readonly _signer: S3Client;
  private readonly _options: IS3StorageOptions;

  constructor(
    @inject(S3_STORAGE_OPTIONS) @optional() options?: IS3StorageOptions,
  ) {
    super();
    this._options = options ?? defaultOptions();
    this._client = this._createClient(this._options.endpoint);
    this._signer = this._options.publicEndpoint
      ? this._createClient(this._options.publicEndpoint)
      : this._client;
  }

  private _createClient(endpoint: string | undefined): S3Client {
    return new S3Client({
      region: this._options.region,
      endpoint,
      forcePathStyle: this._options.forcePathStyle,
      // Контрольные суммы по умолчанию попадают в presigned PUT (от пустого
      // тела) и ломают прямую загрузку; совместимые хранилища их не все знают.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: this._options.accessKeyId,
        secretAccessKey: this._options.secretAccessKey,
      },
    });
  }

  async put(
    key: string,
    body: StorageBody,
    options: PutOptions = {},
  ): Promise<StoredObject> {
    assertValidKey(key);

    if (body instanceof Readable) {
      return withTmpDir(async dir => {
        const tmp = path.join(dir, "body");

        await pipeline(body, createWriteStream(tmp));

        return this.put(key, { path: tmp }, options);
      });
    }

    const size = Buffer.isBuffer(body)
      ? body.length
      : (await fs.stat(body.path)).size;
    const result = await this._client.send(
      new PutObjectCommand({
        Bucket: this._options.bucket,
        Key: key,
        Body: Buffer.isBuffer(body) ? body : createReadStream(body.path),
        ContentLength: size,
        ContentType: options.contentType,
        ContentDisposition: options.contentDisposition,
      }),
    );

    return { size, contentType: options.contentType, etag: result.ETag };
  }

  async get(
    key: string,
    range?: { start: number; end?: number },
  ): Promise<Readable> {
    try {
      const result = await this._client.send(
        new GetObjectCommand({
          Bucket: this._options.bucket,
          Key: assertValidKey(key),
          Range: range ? `bytes=${range.start}-${range.end ?? ""}` : undefined,
        }),
      );

      if (!(result.Body instanceof Readable)) throw StorageError.UNAVAILABLE();

      return result.Body;
    } catch (err) {
      throw isNotFound(err) ? StorageError.NOT_FOUND() : err;
    }
  }

  async stat(key: string): Promise<StoredObject | null> {
    try {
      const result = await this._client.send(
        new HeadObjectCommand({
          Bucket: this._options.bucket,
          Key: assertValidKey(key),
        }),
      );

      return {
        size: result.ContentLength ?? 0,
        contentType: result.ContentType,
        etag: result.ETag,
        lastModified: result.LastModified,
      };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await this._client.send(
      new DeleteObjectCommand({
        Bucket: this._options.bucket,
        Key: assertValidKey(key),
      }),
    );
  }

  async deletePrefix(prefix: string): Promise<void> {
    prefixSegments(prefix);

    let token: string | undefined;

    do {
      const page = await this._client.send(
        new ListObjectsV2Command({
          Bucket: this._options.bucket,
          Prefix: prefix,
          ContinuationToken: token,
          MaxKeys: DELETE_BATCH,
        }),
      );
      const keys = (page.Contents ?? []).flatMap(item =>
        item.Key ? [{ Key: item.Key }] : [],
      );

      if (keys.length > 0) {
        await this._client.send(
          new DeleteObjectsCommand({
            Bucket: this._options.bucket,
            Delete: { Objects: keys, Quiet: true },
          }),
        );
      }

      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }

  signedGetUrl(key: string, options: SignedUrlOptions = {}): Promise<string> {
    return getSignedUrl(
      this._signer,
      new GetObjectCommand({
        Bucket: this._options.bucket,
        Key: assertValidKey(key),
        ResponseContentDisposition: options.downloadName
          ? contentDisposition(options.downloadName)
          : undefined,
      }),
      { expiresIn: options.ttlSeconds ?? this._options.ttlSeconds },
    );
  }

  /** `contentLength` подписывается: S3 не примет тело другой длины. */
  signedPutUrl(
    key: string,
    options: ISignedPutUrlOptions = {},
  ): Promise<string> {
    return getSignedUrl(
      this._signer,
      new PutObjectCommand({
        Bucket: this._options.bucket,
        Key: assertValidKey(key),
        ContentType: options.contentType,
        ContentLength: options.contentLength,
      }),
      {
        expiresIn: options.ttlSeconds ?? this._options.ttlSeconds,
        signableHeaders: new Set(["content-type", "content-length"]),
      },
    );
  }

  /** Временная копия объекта, удаляется после `fn`. */
  async withLocalFile<R>(
    key: string,
    fn: (path: string) => Promise<R>,
  ): Promise<R> {
    const source = await this.get(key);

    return withTmpDir(async dir => {
      const tmp = path.join(dir, path.posix.basename(key));

      await pipeline(source, createWriteStream(tmp));

      return fn(tmp);
    });
  }
}
