import { defineErrors } from "../../core";

/** Ошибки хранилища файлов и раздачи по подписанным ссылкам. */
export const StorageError = defineErrors("STORAGE", {
  INVALID_KEY: { status: 400, message: "Недопустимый ключ файла" },
  NOT_FOUND: { status: 404, message: "Файл не найден" },
  SIGNATURE_INVALID: { status: 403, message: "Неверная подпись ссылки" },
  URL_EXPIRED: { status: 403, message: "Срок действия ссылки истёк" },
  RANGE_NOT_SATISFIABLE: {
    status: 416,
    message: "Запрошенный диапазон недоступен",
  },
  TOO_LARGE: { status: 413, message: "Файл превышает допустимый размер" },
  SIZE_MISMATCH: {
    status: 400,
    message: "Размер файла не совпадает с заявленным",
  },
  CONTENT_TYPE_MISMATCH: {
    status: 415,
    message: "Тип содержимого не совпадает с подписанным",
  },
  UNAVAILABLE: { status: 503, message: "Хранилище файлов недоступно" },
});
