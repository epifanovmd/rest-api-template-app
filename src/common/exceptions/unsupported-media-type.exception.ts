import { HttpStatus } from "../enums";
import { HttpException, HttpExceptionReason } from "./http.exception";

export class UnsupportedMediaTypeException extends HttpException {
  /**
   * Instantiate an `UnsupportedMediaTypeException` Exception.
   *
   * @example
   * `throw new UnsupportedMediaTypeException()`
   *
   @param message string describing the error condition.
   @param reason either a short description of the HTTP error or an options object used to provide an underlying error cause
   */
  constructor(
    message: string = "Unsupported Media Type",
    reason?: HttpExceptionReason,
  ) {
    super(message, HttpStatus.UNSUPPORTED_MEDIA_TYPE, reason);
  }
}
