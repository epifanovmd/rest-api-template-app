import { ApiError } from "./handlers";

export function assertNotNull<T>(
  item: T | null | undefined,
  message?: string,
): T {
  if (item === null || item === undefined) {
    throw new ApiError(message ? message : "", 500);
  }

  return item;
}
