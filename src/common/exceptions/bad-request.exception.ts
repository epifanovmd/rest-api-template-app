import { HttpStatus } from "../enums";
import { HttpException, HttpExceptionReason } from "./http.exception";

export class BadRequestException extends HttpException {
  /**
   * Instantiate a `BadRequestException` Exception.
   *
   * @example
   * `throw new BadRequestException()`

   @param message string describing the error condition.
   @param reason either a short description of the HTTP error or an options object used to provide an underlying error cause
   */
  constructor(message: string = "Bad Request", reason?: HttpExceptionReason) {
    super(message, HttpStatus.BAD_REQUEST, reason);
  }
}
