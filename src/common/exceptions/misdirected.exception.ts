import { HttpStatus } from "../enums";
import { HttpException, HttpExceptionReason } from "./http.exception";

export class MisdirectedException extends HttpException {
  /**
   * Instantiate a `MisdirectedException` Exception.
   *
   * @example
   * `throw new MisdirectedException()`
   *
   @param message string describing the error condition.
   @param reason either a short description of the HTTP error or an options object used to provide an underlying error cause
   */
  constructor(message: string = "Misdirected", reason?: HttpExceptionReason) {
    super(message, HttpStatus.MISDIRECTED, reason);
  }
}
