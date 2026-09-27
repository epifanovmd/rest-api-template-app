import { defineErrors } from "../../core";

export const FileError = defineErrors("FILE", {
  INVALID_UPLOAD_RULE: {
    status: 500,
    message: "Некорректное правило загрузки модуля",
  },
  NOT_FOUND: { status: 404, message: "Файл не найден" },
  FORBIDDEN: {
    status: 403,
    message: "Действие с файлом доступно только владельцу",
  },
  IN_USE: {
    status: 409,
    message: "Файл используется и не может быть удалён",
  },
  TYPE_NOT_ALLOWED: {
    status: 415,
    message: "Недопустимый тип файла",
  },
  SIGNATURE_MISMATCH: {
    status: 415,
    message: "Содержимое файла не соответствует его типу",
  },
  TOO_LARGE: { status: 413, message: "Файл превышает допустимый размер" },
  UPLOAD_INCOMPLETE: {
    status: 409,
    message: "Файл ещё не загружен по выданной ссылке",
  },
  SIZE_MISMATCH: {
    status: 400,
    message: "Размер загруженного файла не совпадает с заявленным",
  },
});
