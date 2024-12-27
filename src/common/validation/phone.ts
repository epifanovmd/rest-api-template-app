import { BadRequestException } from "@force-dev/utils";

import { isPhone } from "../helpers";

export const validatePhone = (phone: string) => {
  if (phone && !isPhone(phone)) {
    throw new BadRequestException(
      "Пожалуйста, введите корректный номер телефона.",
    );
  }
};
