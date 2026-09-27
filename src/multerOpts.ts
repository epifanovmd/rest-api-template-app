import multer from "@koa/multer";
import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

import { UnsupportedMediaTypeException } from "./core/http";
import { isAllowedUpload } from "./modules/file/file-upload.policy";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

/**
 * Временный каталог загрузок: сервис проверяет сигнатуру, кладёт файл в
 * FileStorage и удаляет временную копию.
 */
export const UPLOAD_TMP_DIR = path.join(os.tmpdir(), "uploads");
/** Файлов в одном запросе. */
const MAX_FILES = 10;
/** Частей multipart (файлы + поля). */
const MAX_PARTS = 20;
/** Размер текстового поля формы. */
const MAX_FIELD_SIZE = 64 * 1024;

/** `defParamCharset` есть у multer 2, но не в типах `@koa/multer`. */
type TMulterOptions = multer.Options & { defParamCharset?: "utf8" | "latin1" };

const multerOpts: TMulterOptions = {
  storage: multer.diskStorage({
    destination(_req, _file, cb) {
      fs.mkdir(UPLOAD_TMP_DIR, { recursive: true }, err =>
        cb(err, UPLOAD_TMP_DIR),
      );
    },
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();

      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  // Браузеры и RN пишут имя файла в заголовке сырым UTF-8; по умолчанию
  // busboy читает его как latin1 — кириллица превращается в кракозябры.
  defParamCharset: "utf8",
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
    parts: MAX_PARTS,
    fieldSize: MAX_FIELD_SIZE,
  },
  // Магические байты проверяются после записи во временный файл — в FileService.
  fileFilter(_req, file, cb) {
    if (isAllowedUpload(file.originalname, file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new UnsupportedMediaTypeException(
          `File type "${file.mimetype}" is not allowed`,
        ),
        false,
      );
    }
  },
};

export default multerOpts;
