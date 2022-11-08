import multer from "multer";

const multerOpts: multer.Options = {
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, "./media");
    },
    filename(req, file, cb) {
      const fileFormat = file.originalname.split(".");

      cb(null, `${Date.now()}.${fileFormat[fileFormat.length - 1]}`);
    },
  }),
};

export default multerOpts;
