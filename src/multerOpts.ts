import multer from "multer";
import path from "path";
import { v4 } from "uuid";

import { config } from "./config";

const ALLOWED_MIME_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // Archives
  "application/zip",
  "application/x-rar-compressed",
  // Text
  "text/plain",
  "text/csv",
]);

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
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type "${file.mimetype}" is not allowed`));
    }
  },
};

export default multerOpts;
