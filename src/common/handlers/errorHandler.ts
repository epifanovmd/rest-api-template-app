import { Context, Next } from "koa";

export class ApiError extends Error {
  public status: number;
  public type: string | undefined;

  constructor(
    status: number,
    type?: string,
    message: string = "Ошибка на стороне сервера",
  ) {
    super(message);
    this.status = status;
    this.type = type;
  }
}

export const errorHandler = async (ctx: Context, next: Next) => {
  try {
    await next();
  } catch (err) {
    ctx.status = err.statusCode || 500;
    ctx.body = {
      message: err.message,
      error: { status: err.status, type: err.type, message: err.message },
    };
  }
};
