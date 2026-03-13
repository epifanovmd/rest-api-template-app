import { Context } from "koa";
import { Middlewares } from "tsoa";

import { IGuard } from "../guards";

export const UseGuards = (...guards: (new () => IGuard)[]): MethodDecorator => {
  return Middlewares(
    ...guards.map(Guard => async (ctx: Context, next: () => Promise<void>) => {
      const guard = new Guard();

      if (await guard.process(ctx)) {
        await next();
      }
    }),
  );
};
