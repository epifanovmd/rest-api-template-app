import { HttpStatus } from "../enums";
import { HttpException, HttpExceptionReason } from "./http.exception";

export class PreconditionFailedException extends HttpException {
  /**
   * Instantiate a `PreconditionFailedException` Exception.
   *
   * @example
   * `throw new PreconditionFailedException()`
   *
   @param message string describing the error condition.
   @param reason either a short description of the HTTP error or an options object used to provide an underlying error cause
   */
  constructor(
    message: string = "Precondition Failed",
    reason?: HttpExceptionReason,
  ) {
    super(message, HttpStatus.PRECONDITION_FAILED, reason);
  }
}
