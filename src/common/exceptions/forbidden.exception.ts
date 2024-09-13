import { HttpStatus } from "../enums";
import { HttpException, HttpExceptionReason } from "./http.exception";

export class ForbiddenException extends HttpException {
  /**
   * Instantiate a `ForbiddenException` Exception.
   *
   * @example
   * `throw new ForbiddenException()`
   *
   @param message string describing the error condition.
   @param reason either a short description of the HTTP error or an options object used to provide an underlying error cause
   */
  constructor(message: string = "Forbidden", reason?: HttpExceptionReason) {
    super(message, HttpStatus.FORBIDDEN, reason);
  }
}
