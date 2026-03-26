import { z } from "zod";

import { EDevicePlatform } from "../push.types";

export const RegisterDeviceSchema = z.object({
  token: z
    .string()
    .min(1, "Токен обязателен")
    .max(512, "Токен слишком длинный"),
  platform: z.nativeEnum(EDevicePlatform),
  deviceName: z
    .string()
    .max(100, "Название устройства не должно превышать 100 символов")
    .optional(),
});
