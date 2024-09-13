import { HttpStatus } from "../enums";
import { HttpException, HttpExceptionReason } from "./http.exception";

export class UnauthorizedException extends HttpException {
  /**
   * Instantiate an `UnauthorizedException` Exception.
   *
   * @example
   * `throw new UnauthorizedException()`
   *
   @param message string describing the error condition.
   @param reason either a short description of the HTTP error or an options object used to provide an underlying error cause
   */
  constructor(message: string = "Unauthorized", reason?: HttpExceptionReason) {
    super(message, HttpStatus.UNAUTHORIZED, reason);
  }
}
