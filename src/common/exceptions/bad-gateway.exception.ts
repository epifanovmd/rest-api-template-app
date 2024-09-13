import { HttpStatus } from "../enums";
import { HttpException, HttpExceptionReason } from "./http.exception";

export class BadGatewayException extends HttpException {
  /**
   * Instantiate a `BadGatewayException` Exception.
   *
   * @example
   * `throw new BadGatewayException()`

   @param message string describing the error condition.
   @param reason either a short description of the HTTP error or an options object used to provide an underlying error cause
   */
  constructor(message: string = "Bad Gateway", reason?: HttpExceptionReason) {
    super(message, HttpStatus.BAD_GATEWAY, reason);
  }
}
