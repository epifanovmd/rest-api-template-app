import { HttpException, InternalServerErrorException } from "../exceptions";

export function assertNotNull<T>(
  item: T | null | undefined,
  message?: string | HttpException,
): T {
  if (item === null || item === undefined) {
    if (message instanceof HttpException) {
      throw message;
    }

    throw new InternalServerErrorException(message);
  }

  return item;
}