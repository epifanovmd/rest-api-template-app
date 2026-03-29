import { encode } from "blurhash";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

import { Injectable, logger } from "../../core";

const IMAGE_MAX_SIZE = 2048;
const THUMB_SIZE = 200;
const MEDIUM_SIZE = 800;
const WEBP_QUALITY = 80;
const THUMB_QUALITY = 70;

export interface IImageProcessResult {
  url: string;
  size: number;
  width: number | null;
  height: number | null;
  thumbnailUrl: string | null;
  mediumUrl: string | null;
  blurhash: string | null;
}

export interface IVideoProcessResult {
  thumbnailUrl: string | null;
  mediumUrl: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
}

export interface IAudioProcessResult {
  duration: number | null;
}

@Injectable()
export class MediaProcessorService {
  /** Обработка изображения: сжатие оригинала, thumbnail, medium, blurhash. */
  async processImage(filePath: string, id: string): Promise<IImageProcessResult> {
    const dir = path.dirname(filePath);
    const compressedPath = path.join(dir, `${id}.webp`);
    const thumbPath = path.join(dir, `${id}_thumb.webp`);
    const mediumPath = path.join(dir, `${id}_medium.webp`);

    let width: number | null = null;
    let height: number | null = null;
    let blurhash: string | null = null;
    let thumbnailUrl: string | null = null;
    let mediumUrl: string | null = null;

    try {
      const image = sharp(filePath);
      const metadata = await image.metadata();

      width = metadata.width ?? null;
      height = metadata.height ?? null;

      // Сжатие оригинала: ресайз до max 2048px + webp
      await image
        .resize(IMAGE_MAX_SIZE, IMAGE_MAX_SIZE, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: WEBP_QUALITY })
        .toFile(compressedPath);

      // Thumbnail 200x200
      await sharp(compressedPath)
        .resize(THUMB_SIZE, THUMB_SIZE, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: THUMB_QUALITY })
        .toFile(thumbPath);

      thumbnailUrl = `/${path.basename(dir)}/${id}_thumb.webp`;

      // Medium 800x800
      await sharp(compressedPath)
        .resize(MEDIUM_SIZE, MEDIUM_SIZE, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: THUMB_QUALITY })
        .toFile(mediumPath);

      mediumUrl = `/${path.basename(dir)}/${id}_medium.webp`;

      // Blurhash из thumbnail (маленький → быстро)
      blurhash = await this._generateBlurhash(thumbPath);

      // Удалить оригинал, заменить на сжатый
      if (compressedPath !== filePath) {
        await fs.unlink(filePath).catch(() => {});
      }

      // Обновить размеры сжатого файла
      const compressedMeta = await sharp(compressedPath).metadata();

      width = compressedMeta.width ?? width;
      height = compressedMeta.height ?? height;
    } catch (err) {
      logger.error({ err }, "Failed to process image");

      // Fallback: вернуть оригинал без обработки
      return {
        url: filePath,
        size: (await fs.stat(filePath).catch(() => ({ size: 0 }))).size,
        width,
        height,
        thumbnailUrl: null,
        mediumUrl: null,
        blurhash: null,
      };
    }

    const stat = await fs.stat(compressedPath);

    return {
      url: compressedPath,
      size: stat.size,
      width,
      height,
      thumbnailUrl,
      mediumUrl,
      blurhash,
    };
  }

  /** Обработка видео: thumbnail первого кадра, duration, resolution через ffprobe. */
  async processVideo(filePath: string, id: string): Promise<IVideoProcessResult> {
    const dir = path.dirname(filePath);
    const framePath = path.join(dir, `${id}_frame.png`);
    const thumbPath = path.join(dir, `${id}_thumb.webp`);
    const mediumPath = path.join(dir, `${id}_medium.webp`);

    let thumbnailUrl: string | null = null;
    let mediumUrl: string | null = null;
    let width: number | null = null;
    let height: number | null = null;
    let duration: number | null = null;

    try {
      // Извлечь metadata через ffprobe
      const probe = await this._ffprobe(filePath);

      const videoStream = probe.streams?.find(
        (s: { codec_type?: string }) => s.codec_type === "video",
      );

      if (videoStream) {
        width = videoStream.width ?? null;
        height = videoStream.height ?? null;
      }

      duration = probe.format?.duration
        ? parseFloat(String(probe.format.duration))
        : null;

      // Извлечь первый кадр
      await this._extractFrame(filePath, framePath);

      // Thumbnail из кадра
      await sharp(framePath)
        .resize(THUMB_SIZE, THUMB_SIZE, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: THUMB_QUALITY })
        .toFile(thumbPath);

      thumbnailUrl = `/${path.basename(dir)}/${id}_thumb.webp`;

      // Medium из кадра
      await sharp(framePath)
        .resize(MEDIUM_SIZE, MEDIUM_SIZE, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: THUMB_QUALITY })
        .toFile(mediumPath);

      mediumUrl = `/${path.basename(dir)}/${id}_medium.webp`;

      // Удалить временный кадр
      await fs.unlink(framePath).catch(() => {});
    } catch (err) {
      logger.error({ err }, "Failed to process video");
    }

    return { thumbnailUrl, mediumUrl, width, height, duration };
  }

  /** Обработка аудио: duration через ffprobe. */
  async processAudio(filePath: string): Promise<IAudioProcessResult> {
    let duration: number | null = null;

    try {
      const probe = await this._ffprobe(filePath);

      duration = probe.format?.duration
        ? parseFloat(String(probe.format.duration))
        : null;
    } catch (err) {
      logger.error({ err }, "Failed to process audio");
    }

    return { duration };
  }

  /** Генерация blurhash из маленького изображения. */
  private async _generateBlurhash(imagePath: string): Promise<string | null> {
    try {
      const { data, info } = await sharp(imagePath)
        .raw()
        .ensureAlpha()
        .resize(32, 32, { fit: "inside" })
        .toBuffer({ resolveWithObject: true });

      return encode(
        new Uint8ClampedArray(data),
        info.width,
        info.height,
        4,
        3,
      );
    } catch (err) {
      logger.error({ err }, "Failed to generate blurhash");

      return null;
    }
  }

  /** Извлечь первый кадр из видео. */
  private _extractFrame(videoPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .frames(1)
        .outputOptions("-vf", "scale=iw:ih")
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(err))
        .run();
    });
  }

  /** Запуск ffprobe для извлечения metadata. */
  private _ffprobe(filePath: string): Promise<ffmpeg.FfprobeData> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err: Error | null, data: ffmpeg.FfprobeData) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
  }
}
