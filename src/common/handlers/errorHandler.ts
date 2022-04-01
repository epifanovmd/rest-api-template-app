import { Context, Next } from "koa";

export class ApiError extends Error {
  private statusCode: number;
  private type: string | undefined;

  constructor(
    name: string,
    statusCode: number,
    type?: string,
    message?: string,
  ) {
    super(message);
    this.name = name;
    this.statusCode = statusCode;
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
      error: err,
    };
  }
};
