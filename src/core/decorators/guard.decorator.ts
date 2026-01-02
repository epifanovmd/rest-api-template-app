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

// export const UseGuards = (...guards: (new () => IGuard)[]): MethodDecorator => {
//   return (
//     target: any,
//     propertyKey: string | symbol,
//     descriptor: PropertyDescriptor,
//   ) => {
//     // Сохраняем guards в метаданных
//     const existingGuards =
//       Reflect.getMetadata("guards", target, propertyKey) || [];
//
//     Reflect.defineMetadata(
//       "guards",
//       [...existingGuards, ...guards],
//       target,
//       propertyKey,
//     );
//   };
// };
