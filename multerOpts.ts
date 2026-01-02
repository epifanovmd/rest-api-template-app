import multer from "multer";
import { v4 } from "uuid";

import { config } from "./config";

const multerOpts: multer.Options = {
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, config.server.filesFolderPath);
    },
    filename(req, file, cb) {
      const fileFormat = file.originalname.split(".");

      cb(null, `${v4()}.${fileFormat[fileFormat.length - 1]}`);
    },
  }),
};

export default multerOpts;
