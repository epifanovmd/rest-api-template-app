import { HttpStatus } from "../enums";
import { HttpException, HttpExceptionReason } from "./http.exception";

export class RequestTimeoutException extends HttpException {
  /**
   * Instantiate a `RequestTimeoutException` Exception.
   *
   * @example
   * `throw new RequestTimeoutException()`
   *
   @param message string describing the error condition.
   @param reason either a short description of the HTTP error or an options object used to provide an underlying error cause
   */
  constructor(
    message: string = "Request Timeout",
    reason?: HttpExceptionReason,
  ) {
    super(message, HttpStatus.REQUEST_TIMEOUT, reason);
  }
}
