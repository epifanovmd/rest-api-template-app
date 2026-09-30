import { defineErrors, HttpStatus } from "../../core";

/** Доменные ошибки профилей: коды `PROFILE_*`. */
export const ProfileError = defineErrors("PROFILE", {
  NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: "Профиль не найден" },
  AVATAR_INVALID: {
    status: HttpStatus.BAD_REQUEST,
    message:
      "Аватар — своё загруженное изображение, обработка которого не завершилась ошибкой",
  },
  SUPERUSER_EDIT: {
    status: HttpStatus.FORBIDDEN,
    message: "Профиль суперпользователя меняет только суперпользователь",
  },
});
