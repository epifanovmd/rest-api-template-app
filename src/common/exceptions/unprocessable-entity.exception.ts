import { HttpStatus } from "../enums";
import { HttpException, HttpExceptionReason } from "./http.exception";

export class UnprocessableEntityException extends HttpException {
  /**
   * Instantiate an `UnprocessableEntityException` Exception.
   *
   * @example
   * `throw new UnprocessableEntityException()`
   *
   @param message string describing the error condition.
   @param reason either a short description of the HTTP error or an options object used to provide an underlying error cause
   */
  constructor(
    message: string = "Unprocessable Entity",
    reason?: HttpExceptionReason,
  ) {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, reason);
  }
}
