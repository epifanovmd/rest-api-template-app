import { ApiError } from "./handlers";

export function assertNotNull<T>(
  item: T | null | undefined,
  message?: string | ApiError,
): T {
  if (item === null || item === undefined) {
    if (message instanceof ApiError) {
      throw message;
    }

    throw new ApiError(message ? message : "", 500);
  }

  return item;
}
