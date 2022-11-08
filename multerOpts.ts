import multer from "multer";
import { v4 } from "uuid";

const multerOpts: multer.Options = {
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, "./media");
    },
    filename(req, file, cb) {
      const fileFormat = file.originalname.split(".");

      cb(null, `${v4()}.${fileFormat[fileFormat.length - 1]}`);
    },
  }),
};

export default multerOpts;
