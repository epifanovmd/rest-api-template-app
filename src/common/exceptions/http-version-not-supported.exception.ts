import { HttpStatus } from "../enums";
import { HttpException, HttpExceptionReason } from "./http.exception";

export class HttpVersionNotSupportedException extends HttpException {
  /**
   * Instantiate a `HttpVersionNotSupportedException` Exception.
   *
   * @example
   * `throw new HttpVersionNotSupportedException()`
   *
   @param message string describing the error condition.
   @param reason either a short description of the HTTP error or an options object used to provide an underlying error cause
   */
  constructor(
    message: string = "HTTP Version Not Supported",
    reason?: HttpExceptionReason,
  ) {
    super(message, HttpStatus.HTTP_VERSION_NOT_SUPPORTED, reason);
  }
}
