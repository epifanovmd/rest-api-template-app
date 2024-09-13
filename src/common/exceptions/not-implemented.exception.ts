import { HttpStatus } from "../enums";
import { HttpException, HttpExceptionReason } from "./http.exception";

export class NotImplementedException extends HttpException {
  /**
   * Instantiate a `NotImplementedException` Exception.
   *
   * @example
   * `throw new NotImplementedException()`
   *
   * @param descriptionOrOptions either a short description of the HTTP error or an options object used to provide an underlying error cause
   * @param error a short description of the HTTP error.
   */
  constructor(
    message: string = "Not Implemented",
    reason?: HttpExceptionReason,
  ) {
    super(message, HttpStatus.NOT_IMPLEMENTED, reason);
  }
}
