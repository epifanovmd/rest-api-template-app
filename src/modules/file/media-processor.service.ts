import { encode } from "blurhash";
import path from "path";
import sharp from "sharp";

import { Injectable, logger } from "../../core";
import { ffmpeg } from "./ffmpeg";
import type { TFileVariant } from "./file-keys";

const IMAGE_MAX_SIZE = 2048;
/** Предел сырого PCM для waveform (~10 минут mono 8 kHz). */
const WAVEFORM_MAX_BUFFER = 10 * 1024 * 1024;
const WAVEFORM_SAMPLES = 64;
const THUMB_SIZE = 200;
const MEDIUM_SIZE = 800;
const WEBP_QUALITY = 80;
const THUMB_QUALITY = 70;
const INT16_MAX = 32767;

/** Производный файл во временном каталоге обработки. */
export interface IMediaDerivative {
  variant: TFileVariant;
  path: string;
  ext: string;
  contentType: string;
}

export interface IMediaProcessResult {
  width: number | null;
  height: number | null;
  blurhash: string | null;
  duration: number | null;
  waveform: number[] | null;
  derivatives: IMediaDerivative[];
}

/** Для каких типов нужна фоновая обработка. */
export const isProcessableMedia = (mimeType: string): boolean =>
  /^(image|video|audio)\//.test(mimeType);

const webp = (variant: TFileVariant, dir: string): IMediaDerivative => ({
  variant,
  path: path.join(dir, `${variant}.webp`),
  ext: "webp",
  contentType: "image/webp",
});

const resizeTo = (size: number) =>
  [size, size, { fit: "inside", withoutEnlargement: true }] as const;

const parseDuration = (value: string | undefined): number | null => {
  const duration = value ? parseFloat(value) : NaN;

  return Number.isFinite(duration) ? duration : null;
};

/** Необязательный шаг: сбой логируется, результат — `null`. */
const optionalStep = async <T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T | null> => {
  try {
    return await fn();
  } catch (err) {
    logger.warn({ err, step: name }, "Media processing step failed");

    return null;
  }
};

/** Пиковые амплитуды 0..1 по сегментам PCM s16le. */
export const computeWaveform = (
  pcm: Buffer,
  sampleCount = WAVEFORM_SAMPLES,
): number[] | null => {
  const totalSamples = Math.floor(pcm.length / 2);

  if (totalSamples === 0) return null;

  const perBucket = Math.max(1, Math.floor(totalSamples / sampleCount));

  return Array.from({ length: sampleCount }, (_, bucket) => {
    const start = bucket * perBucket;
    const end = Math.min(start + perBucket, totalSamples);
    let peak = 0;

    for (let i = start; i < end; i += 1) {
      peak = Math.max(peak, Math.abs(pcm.readInt16LE(i * 2)));
    }

    return Math.round((peak / INT16_MAX) * 100) / 100;
  });
};

/**
 * Обработка медиа на локальных файлах: производные пишутся в `workDir`,
 * загрузку в хранилище делает вызывающий. Сбой основного шага (декодирование)
 * — исключение; превью, blurhash и waveform — необязательны.
 */
@Injectable()
export class MediaProcessorService {
  async process(
    inputPath: string,
    mimeType: string,
    workDir: string,
    signal?: AbortSignal,
  ): Promise<IMediaProcessResult> {
    signal?.throwIfAborted();

    if (mimeType.startsWith("image/")) {
      return this._processImage(inputPath, workDir);
    }

    if (mimeType.startsWith("video/")) {
      return this._processVideo(inputPath, workDir, signal);
    }

    if (mimeType.startsWith("audio/")) {
      return this._processAudio(inputPath, workDir, signal);
    }

    return {
      width: null,
      height: null,
      blurhash: null,
      duration: null,
      waveform: null,
      derivatives: [],
    };
  }

  /** webp до 2048px, превью 200 и 800, blurhash. */
  private async _processImage(
    inputPath: string,
    workDir: string,
  ): Promise<IMediaProcessResult> {
    const optimized = webp("optimized", workDir);
    const info = await sharp(inputPath)
      .rotate()
      .resize(...resizeTo(IMAGE_MAX_SIZE))
      .webp({ quality: WEBP_QUALITY })
      .toFile(optimized.path);
    const previews = await this._previews(optimized.path, workDir);
    const thumbnail = previews.find(d => d.variant === "thumbnail");

    return {
      width: info.width,
      height: info.height,
      blurhash: thumbnail ? await this._blurhash(thumbnail.path) : null,
      duration: null,
      waveform: null,
      derivatives: [optimized, ...previews],
    };
  }

  /** Метаданные ffprobe и превью из первого кадра. */
  private async _processVideo(
    inputPath: string,
    workDir: string,
    signal?: AbortSignal,
  ): Promise<IMediaProcessResult> {
    const probe = await ffmpeg.probe(inputPath);
    const video = probe.streams?.find(s => s.codec_type === "video");
    const framePath = path.join(workDir, "frame.png");

    signal?.throwIfAborted();

    const previews =
      (await optionalStep("video-frame", async () => {
        await ffmpeg.run(["-i", inputPath, "-frames:v", "1", framePath]);

        return this._previews(framePath, workDir);
      })) ?? [];
    const thumbnail = previews.find(d => d.variant === "thumbnail");

    return {
      width: video?.width ?? null,
      height: video?.height ?? null,
      blurhash: thumbnail ? await this._blurhash(thumbnail.path) : null,
      duration: parseDuration(probe.format?.duration),
      waveform: null,
      derivatives: previews,
    };
  }

  /** m4a (AAC 128k), длительность и waveform. */
  private async _processAudio(
    inputPath: string,
    workDir: string,
    signal?: AbortSignal,
  ): Promise<IMediaProcessResult> {
    const optimized: IMediaDerivative = {
      variant: "optimized",
      path: path.join(workDir, "optimized.m4a"),
      ext: "m4a",
      contentType: "audio/mp4",
    };

    await ffmpeg.run([
      "-i",
      inputPath,
      "-vn",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      optimized.path,
    ]);
    signal?.throwIfAborted();

    const probe = await ffmpeg.probe(optimized.path);
    const waveform = await optionalStep("waveform", async () =>
      computeWaveform(
        await ffmpeg.decode(
          [
            "-i",
            optimized.path,
            "-ac",
            "1",
            "-ar",
            "8000",
            "-f",
            "s16le",
            "-acodec",
            "pcm_s16le",
            "pipe:1",
          ],
          WAVEFORM_MAX_BUFFER,
        ),
      ),
    );

    return {
      width: null,
      height: null,
      blurhash: null,
      duration: parseDuration(probe.format?.duration),
      waveform,
      derivatives: [optimized],
    };
  }

  /** Превью 200 и 800 px (webp). */
  private async _previews(
    sourcePath: string,
    workDir: string,
  ): Promise<IMediaDerivative[]> {
    const thumbnail = webp("thumbnail", workDir);
    const medium = webp("medium", workDir);

    await sharp(sourcePath)
      .resize(...resizeTo(THUMB_SIZE))
      .webp({ quality: THUMB_QUALITY })
      .toFile(thumbnail.path);
    await sharp(sourcePath)
      .resize(...resizeTo(MEDIUM_SIZE))
      .webp({ quality: THUMB_QUALITY })
      .toFile(medium.path);

    return [thumbnail, medium];
  }

  private _blurhash(imagePath: string): Promise<string | null> {
    return optionalStep("blurhash", async () => {
      const { data, info } = await sharp(imagePath)
        .raw()
        .ensureAlpha()
        .resize(32, 32, { fit: "inside" })
        .toBuffer({ resolveWithObject: true });

      return encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3);
    });
  }
}
