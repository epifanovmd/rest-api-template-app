import { HttpStatus } from "../enums";
import { HttpException, HttpExceptionReason } from "./http.exception";

export class GoneException extends HttpException {
  /**
   * Instantiate a `GoneException` Exception.
   *
   * @example
   * `throw new GoneException()`
   *
   @param message string describing the error condition.
   @param reason either a short description of the HTTP error or an options object used to provide an underlying error cause
   */
  constructor(message: string = "Gone", reason?: HttpExceptionReason) {
    super(message, HttpStatus.GONE, reason);
  }
}
