import { HttpStatus } from "../enums";
import { HttpException, HttpExceptionReason } from "./http.exception";

export class InternalServerErrorException extends HttpException {
  /**
   * Instantiate an `InternalServerErrorException` Exception.
   *
   * @example
   * `throw new InternalServerErrorException()`
   *
   @param message string describing the error condition.
   @param reason either a short description of the HTTP error or an options object used to provide an underlying error cause
   */
  constructor(
    message: string = "Internal Server Error",
    reason?: HttpExceptionReason,
  ) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, reason);
  }
}
