import { HttpStatus } from "../enums";
import { HttpException, HttpExceptionReason } from "./http.exception";

export class NotFoundException extends HttpException {
  /**
   * Instantiate a `NotFoundException` Exception.
   *
   * @example
   * `throw new NotFoundException()`
   *
   @param message string describing the error condition.
   @param reason either a short description of the HTTP error or an options object used to provide an underlying error cause
   */
  constructor(message: string = "Not Found", reason?: HttpExceptionReason) {
    super(message, HttpStatus.NOT_FOUND, reason);
  }
}
