import Router from "@koa/router";
import { Container } from "inversify";
import { Context } from "koa";

import { IGuard, RouteDefinition } from "./core";

export class RouterBuilder {
  static build(container: Container, ...controllers: any[]): Router {
    const router = new Router();

    controllers.forEach(ControllerClass => {
      const controller: any = container.get(ControllerClass);
      const prefix = Reflect.getMetadata("prefix", ControllerClass);
      const routes: RouteDefinition[] =
        Reflect.getMetadata("routes", ControllerClass) || [];

      routes.forEach(route => {
        const fullPath = prefix + route.path;

        router[route.method]("/" + fullPath, async (ctx: any) => {
          const success = await this.applyGuards(
            controller,
            route.methodName,
            ctx,
          );

          if (!success) {
            return;
          }

          return controller[route.methodName].call(controller, ctx);
        });
      });
    });

    return router;
  }

  static applyGuards = async (
    controller: any,
    method: string,
    ctx: Context,
  ) => {
    const guards = Reflect.getMetadata("guards", controller, method) || [];

    for (const GuardClass of guards as (new () => IGuard)[]) {
      const guard = new GuardClass();

      if (!(await guard.process(ctx))) {
        return false;
      }
    }

    return true;
  };
}
