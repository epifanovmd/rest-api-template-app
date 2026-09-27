import { bodyParser } from "@koa/bodyparser";

/** JSON и формы; multipart разбирает multer на маршрутах загрузки. */
export const bodyParserMiddleware = bodyParser({
  enableTypes: ["json", "form"],
  jsonLimit: "1mb",
  formLimit: "1mb",
});
