import { inject } from "inversify";

import { FileStorage, Injectable } from "../../core";
import type { IFileDto } from "./file.dto";
import { File } from "./file.entity";
import { EFileStatus } from "./file.types";
import type { TFileRef, TSignedFiles } from "./signed-files";

/**
 * Единственное место подписи ссылок на файлы. Подпись асинхронна (S3
 * presign), поэтому ссылки подписываются здесь, пачкой, до сборки DTO;
 * DTO модулей берут их из карты `TSignedFiles`.
 */
@Injectable()
export class FileUrlService {
  constructor(@inject(FileStorage) private readonly _storage: FileStorage) {}

  async toDto(file: File): Promise<IFileDto> {
    const isUploaded = file.status !== EFileStatus.Pending;
    const [url, downloadUrl, thumbnailUrl, mediumUrl] = await Promise.all([
      isUploaded ? this._sign(file.optimizedKey ?? file.key) : null,
      isUploaded ? this._sign(file.key, file.name) : null,
      this._sign(file.thumbnailKey),
      this._sign(file.mediumKey),
    ]);

    return {
      id: file.id,
      ownerId: file.ownerId,
      name: file.name,
      type: file.type,
      size: file.size,
      status: file.status,
      url,
      downloadUrl,
      thumbnailUrl,
      mediumUrl,
      blurhash: file.blurhash,
      width: file.width,
      height: file.height,
      duration: file.duration,
      waveform: file.waveform,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }

  toDtos(files: File[]): Promise<IFileDto[]> {
    return Promise.all(files.map(file => this.toDto(file)));
  }

  /** Подписать файлы пачкой: одна подпись на файл, повторы и пустые пропускаются. */
  async toDtoMap(files: Iterable<TFileRef>): Promise<TSignedFiles> {
    const unique = new Map<string, File>();

    for (const file of files) {
      if (file) unique.set(file.id, file);
    }

    if (unique.size === 0) return new Map();

    const dtos = await this.toDtos([...unique.values()]);

    return new Map(dtos.map(dto => [dto.id, dto]));
  }

  /**
   * Собрать DTO сущностей с файлами: `collect` перечисляет файлы всех
   * сущностей, они подписываются одной пачкой, `build` берёт ссылки из карты.
   */
  async buildWithFiles<E, D>(
    entities: readonly E[],
    collect: (entities: readonly E[]) => Iterable<TFileRef>,
    build: (entity: E, files: TSignedFiles) => D,
  ): Promise<D[]> {
    const files = await this.toDtoMap(collect(entities));

    return entities.map(entity => build(entity, files));
  }

  /** `buildWithFiles` для одной сущности. */
  async buildOneWithFiles<E, D>(
    entity: E,
    collect: (entities: readonly E[]) => Iterable<TFileRef>,
    build: (entity: E, files: TSignedFiles) => D,
  ): Promise<D> {
    const [dto] = await this.buildWithFiles([entity], collect, build);

    return dto;
  }

  private async _sign(
    key: string | null,
    downloadName?: string,
  ): Promise<string | null> {
    return key ? this._storage.signedGetUrl(key, { downloadName }) : null;
  }
}
