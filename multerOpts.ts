import multer from "multer";
import { v4 } from "uuid";
import { SERVER_FILES_FOLDER_PATH } from "./config";

const multerOpts: multer.Options = {
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, SERVER_FILES_FOLDER_PATH);
    },
    filename(req, file, cb) {
      const fileFormat = file.originalname.split(".");

      cb(null, `${v4()}.${fileFormat[fileFormat.length - 1]}`);
    },
  }),
};

export default multerOpts;
