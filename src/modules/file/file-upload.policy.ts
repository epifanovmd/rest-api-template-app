import fs from "fs/promises";
import path from "path";

import { FileError } from "./file.errors";

export interface IUploadRule {
  /** Допустимые mime от клиента для этого расширения. */
  mimes: readonly string[];
  /**
   * Расширения, которые file-type может определить по сигнатуре; `null` —
   * текст без сигнатуры; `"binary"` — бинарный формат без узнаваемой
   * сигнатуры (веса моделей): файл не должен распознаваться как другой тип.
   */
  signatures: readonly string[] | null | "binary";
  /** Отдаётся inline (медиа); остальное — с `Content-Disposition: attachment`. */
  inline: boolean;
}

const image = (mimes: string[], signatures: string[]): IUploadRule => ({
  mimes,
  signatures,
  inline: true,
});
const media = image;
const document = (
  mimes: string[],
  signatures: string[] | null,
): IUploadRule => ({
  mimes,
  signatures,
  inline: false,
});

const OFFICE_DOC = "application/vnd.openxmlformats-officedocument";

/** Белый список загрузок: расширение → mime и ожидаемая сигнатура. */
const UPLOAD_RULES: Record<string, IUploadRule> = {
  jpg: image(["image/jpeg"], ["jpg"]),
  jpeg: image(["image/jpeg"], ["jpg"]),
  png: image(["image/png"], ["png"]),
  gif: image(["image/gif"], ["gif"]),
  webp: image(["image/webp"], ["webp"]),
  heic: image(["image/heic", "image/heif"], ["heic", "heif"]),
  heif: image(["image/heif", "image/heic"], ["heic", "heif"]),
  mp4: media(["video/mp4", "audio/mp4"], ["mp4", "m4v", "m4a"]),
  mov: media(["video/quicktime"], ["mov"]),
  webm: media(["video/webm", "audio/webm"], ["webm"]),
  mkv: media(["video/x-matroska", "video/matroska"], ["mkv", "webm"]),
  mp3: media(["audio/mpeg", "audio/mp3"], ["mp3"]),
  m4a: media(["audio/mp4", "audio/x-m4a", "audio/m4a"], ["m4a", "mp4"]),
  ogg: media(
    ["audio/ogg", "video/ogg", "application/ogg"],
    ["ogg", "oga", "ogv", "opus", "spx"],
  ),
  opus: media(["audio/ogg", "audio/opus"], ["opus", "ogg"]),
  wav: media(["audio/wav", "audio/x-wav", "audio/wave"], ["wav"]),
  aac: media(["audio/aac", "audio/x-aac"], ["aac"]),
  pdf: document(["application/pdf"], ["pdf"]),
  doc: document(["application/msword"], ["cfb"]),
  xls: document(["application/vnd.ms-excel"], ["cfb"]),
  docx: document([`${OFFICE_DOC}.wordprocessingml.document`], ["docx", "zip"]),
  xlsx: document([`${OFFICE_DOC}.spreadsheetml.sheet`], ["xlsx", "zip"]),
  zip: document(["application/zip", "application/x-zip-compressed"], ["zip"]),
  rar: document(
    ["application/x-rar-compressed", "application/vnd.rar"],
    ["rar"],
  ),
  txt: document(["text/plain"], null),
  csv: document(["text/csv", "text/plain", "application/vnd.ms-excel"], null),
};

/** Сколько байт текста проверять на бинарное содержимое. */
const TEXT_PROBE_BYTES = 8 * 1024;

/** Правила, объявленные модулями (`defineUploadRules`). */
const moduleRules = new Map<string, IUploadRule>();

const EXT_RE = /^[a-z0-9]{1,16}$/;

/**
 * Модуль расширяет белый список загрузок своими форматами — общий список не
 * правится. Расширение базового списка переопределить нельзя.
 *
 * @example
 * defineUploadRules({
 *   pt: { mimes: ["application/octet-stream"], signatures: ["zip"], inline: false },
 *   onnx: { mimes: ["application/octet-stream"], signatures: "binary", inline: false },
 * });
 */
export const defineUploadRules = (rules: Record<string, IUploadRule>): void => {
  for (const [ext, rule] of Object.entries(rules)) {
    if (!EXT_RE.test(ext) || Object.hasOwn(UPLOAD_RULES, ext)) {
      throw FileError.INVALID_UPLOAD_RULE({ ext });
    }
    moduleRules.set(ext, rule);
  }
};

/** Только для тестов. */
export const resetUploadRules = (): void => moduleRules.clear();

const ruleFor = (fileName: string): IUploadRule | undefined => {
  const ext = path.extname(fileName).slice(1).toLowerCase();

  return Object.hasOwn(UPLOAD_RULES, ext)
    ? UPLOAD_RULES[ext]
    : moduleRules.get(ext);
};

const looksLikeText = async (filePath: string): Promise<boolean> => {
  const handle = await fs.open(filePath, "r");

  try {
    const buffer = Buffer.alloc(TEXT_PROBE_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, TEXT_PROBE_BYTES, 0);

    return !buffer.subarray(0, bytesRead).includes(0);
  } finally {
    await handle.close();
  }
};

/** Расширение из белого списка и заявленный mime ему соответствует. */
export const isAllowedUpload = (
  originalName: string,
  mimetype: string,
): boolean => ruleFor(originalName)?.mimes.includes(mimetype) ?? false;

/** Сколько первых байт объекта нужно для проверки сигнатуры. */
export const SIGNATURE_PROBE_BYTES = 64 * 1024;

const matchesRule = (
  rule: IUploadRule,
  detected: { ext: string } | undefined,
  looksText: () => boolean | Promise<boolean>,
) => {
  if (rule.signatures === "binary") return !detected;
  if (rule.signatures === null) return !detected && looksText();

  return !!detected && rule.signatures.includes(detected.ext);
};

/**
 * Магические байты файла соответствуют расширению. Текстовые форматы
 * не имеют сигнатуры: файл не должен распознаваться как бинарный.
 */
export const verifyFileSignature = async (
  filePath: string,
  originalName: string,
): Promise<boolean> => {
  const rule = ruleFor(originalName);

  if (!rule) return false;

  // file-type — ESM-only пакет, в CommonJS доступен только через import().
  const { fileTypeFromFile } = await import("file-type");

  return matchesRule(rule, await fileTypeFromFile(filePath), () =>
    looksLikeText(filePath),
  );
};

/**
 * То же по началу файла (`SIGNATURE_PROBE_BYTES`) — для объектов в
 * хранилище, которые не нужно скачивать целиком.
 */
export const verifyFileSignatureHead = async (
  head: Buffer,
  originalName: string,
): Promise<boolean> => {
  const rule = ruleFor(originalName);

  if (!rule) return false;

  const { fileTypeFromBuffer } = await import("file-type");

  return matchesRule(
    rule,
    await fileTypeFromBuffer(head),
    () => !head.subarray(0, TEXT_PROBE_BYTES).includes(0),
  );
};

/** Файл хранилища отдаётся inline (изображение, видео, аудио). */
export const isInlineMedia = (fileName: string): boolean =>
  ruleFor(fileName)?.inline ?? false;
