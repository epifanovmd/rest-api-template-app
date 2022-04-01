import { ErrorType } from "./errorType";
import { ApiError } from "./handlers/errorHandler";

export function assertNotNull<T>(
  item: T | null | undefined,
  message?: string,
): T {
  if (item === null || item === undefined) {
    throw new ApiError(
      "ServerError",
      500,
      ErrorType.ServerErrorException,
      message ? message : "",
    );
  }

  return item;
}
