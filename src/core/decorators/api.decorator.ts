import { injectable } from "inversify";

export enum HttpMethod {
  GET = "get",
  POST = "post",
  PUT = "put",
  DELETE = "delete",
  PATCH = "patch",
}

export interface RouteDefinition {
  path: string;
  method: HttpMethod;
  methodName: string;
  middleware?: any[];
}

// Декоратор контроллера
export const Controller = (prefix: string = ""): ClassDecorator => {
  return (target: any) => {
    Reflect.defineMetadata("prefix", prefix, target);
    if (!Reflect.hasMetadata("routes", target)) {
      Reflect.defineMetadata("routes", [], target);
    }

    return injectable()(target);
  };
};

// Декораторы методов
export const createMethodDecorator = (
  method: HttpMethod,
  path: string = "/",
) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    if (!Reflect.hasMetadata("routes", target.constructor)) {
      Reflect.defineMetadata("routes", [], target.constructor);
    }

    const routes = Reflect.getMetadata(
      "routes",
      target.constructor,
    ) as RouteDefinition[];

    routes.push({
      method,
      path,
      methodName: propertyKey,
    });

    Reflect.defineMetadata("routes", routes, target.constructor);
  };
};

export const Get = (path: string = "/") =>
  createMethodDecorator(HttpMethod.GET, path);
export const Post = (path: string = "/") =>
  createMethodDecorator(HttpMethod.POST, path);
export const Put = (path: string = "/") =>
  createMethodDecorator(HttpMethod.PUT, path);
export const Delete = (path: string = "/") =>
  createMethodDecorator(HttpMethod.DELETE, path);
