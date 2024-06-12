import { Context, Next } from "koa";

export class ApiError extends Error {
  public status: number;
  public type: string | undefined;

  constructor(message: string = "Ошибка на стороне сервера", status: number) {
    super(message);
    this.status = status;
  }
}

export const errorHandler = async (ctx: Context, next: Next) => {
  try {
    await next();
  } catch (err) {
    ctx.status = err.statusCode || 500;
    ctx.body = {
      message: err.message,
      error: { status: err.status, message: err.message },
    };
  }
};
