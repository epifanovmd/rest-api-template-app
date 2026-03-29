import multer from "multer";
import path from "path";
import { v4 } from "uuid";

import { config } from "./config";

const ALLOWED_MIME_TYPES = new Set([
  // Изображения
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  // Видео
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
  // Аудио
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/webm",
  "audio/wav",
  "audio/x-m4a",
  "audio/aac",
  // Документы
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // Архивы
  "application/zip",
  "application/x-rar-compressed",
  // Текст
  "text/plain",
  "text/csv",
]);

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

const multerOpts: multer.Options = {
  storage: multer.diskStorage({
    destination(_req, _file, cb) {
      cb(null, config.server.filesFolderPath);
    },
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();

      cb(null, `${v4()}${ext}`);
    },
  }),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type "${file.mimetype}" is not allowed`));
    }
  },
};

export default multerOpts;
