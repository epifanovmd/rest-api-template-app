const { readFile, writeFile } = require("fs");

const pathToKoaHbsFile =
  "./node_modules/@tsoa/cli/dist/routeGeneration/templates/koa.hbs";
const pathToMulterOptsFile = "./multerOpts.ts";

const variantReplace = [
  "const upload = multer();",
  "const upload = multer({{{json multerOpts}}});",
];
const stringForReplace =
  "import multerOpts from '../multerOpts';\nconst upload = multer(multerOpts);";

readFile(pathToKoaHbsFile, "utf-8", (err, koa_hbs) => {
  if (err) {
    return;
  }
  readFile(pathToMulterOptsFile, "utf-8", (err, multerOptsContent) => {
    if (err) {
      writeFile(pathToMulterOptsFile, "export default {};\n", "utf-8", err => {
        console.log(err);
      });
    }
    let replaced = koa_hbs;

    variantReplace.forEach(replaceStr => {
      replaced = replaced?.replace(replaceStr, stringForReplace);
    });
    writeFile(pathToKoaHbsFile, replaced, "utf-8", err => {
      if (err) {
        console.log(err);
      } else {
        console.log("Success patch koa.hbs in 'tsoa'");
      }
    });
  });
});
