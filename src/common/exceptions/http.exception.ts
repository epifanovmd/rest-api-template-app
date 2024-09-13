export type HttpExceptionReason =
  | string
  | Record<string, unknown>
  | Error
  | undefined;

export class HttpException extends Error {
  constructor(
    public readonly message: string,
    public readonly status: number,
    public readonly reason?: HttpExceptionReason,
  ) {
    super();
    this.name = this.constructor.name;
    this.message = message;
    this.status = status;
    this.reason = reason;
  }
}
