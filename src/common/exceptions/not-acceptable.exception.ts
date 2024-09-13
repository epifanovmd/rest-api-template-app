import { HttpStatus } from "../enums";
import { HttpException, HttpExceptionReason } from "./http.exception";

export class NotAcceptableException extends HttpException {
  /**
   * Instantiate a `NotAcceptableException` Exception.
   *
   * @example
   * `throw new NotAcceptableException()`
   *
   @param message string describing the error condition.
   @param reason either a short description of the HTTP error or an options object used to provide an underlying error cause
   */
  constructor(
    message: string = "Not Acceptable",
    reason?: HttpExceptionReason,
  ) {
    super(message, HttpStatus.NOT_ACCEPTABLE, reason);
  }
}
