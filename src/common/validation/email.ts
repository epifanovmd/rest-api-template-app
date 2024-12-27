import { BadRequestException } from "@force-dev/utils";

import { isEmail } from "../helpers";

export const validateEmail = (email: string) => {
  if (!isEmail(email)) {
    throw new BadRequestException(
      "Пожалуйста, введите корректный адрес электронной почты.",
    );
  }
};
