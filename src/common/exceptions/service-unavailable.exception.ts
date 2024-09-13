import { HttpStatus } from "../enums";
import { HttpException, HttpExceptionReason } from "./http.exception";

export class ServiceUnavailableException extends HttpException {
  /**
   * Instantiate a `ServiceUnavailableException` Exception.
   *
   * @example
   * `throw new ServiceUnavailableException()`
   *

   @param message string describing the error condition.
   @param reason either a short description of the HTTP error or an options object used to provide an underlying error cause
   */
  constructor(
    message: string = "Service Unavailable",
    reason?: HttpExceptionReason,
  ) {
    super(message, HttpStatus.SERVICE_UNAVAILABLE, reason);
  }
}
