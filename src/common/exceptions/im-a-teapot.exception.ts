import { HttpStatus } from "../enums";
import { HttpException, HttpExceptionReason } from "./http.exception";

export class ImATeapotException extends HttpException {
  /**
   * Instantiate an `ImATeapotException` Exception.
   *
   * @example
   * `throw new ImATeapotException()`
   *
   @param message string describing the error condition.
   @param reason either a short description of the HTTP error or an options object used to provide an underlying error cause
   */
  constructor(message: string = "I'm a teapot", reason?: HttpExceptionReason) {
    super(message, HttpStatus.I_AM_A_TEAPOT, reason);
  }
}
