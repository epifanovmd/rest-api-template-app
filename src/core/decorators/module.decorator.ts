import { interfaces } from "inversify";

import { IBootstrap } from "../bootstrap";

type Constructor<T = any> = new (...args: any[]) => T;
type ServiceIdentifier<T = any> = interfaces.ServiceIdentifier<T>;

/**
 * Конфигурация провайдера с токеном.
 * Используется для multi-bind и привязок по интерфейс-символу.
 */
export interface TokenProvider<T = any> {
  provide: ServiceIdentifier<T>;
  useClass: Constructor<T>;
}

/**
 * Провайдер модуля — либо класс (bind to self), либо token-binding.
 */
export type ModuleProvider = Constructor | TokenProvider;

export interface ModuleOptions {
  /** Другие модули, чьи провайдеры будут доступны в этом модуле */
  imports?: Constructor[];
  /** Сервисы и классы, регистрируемые в IoC контейнере */
  providers?: ModuleProvider[];
  /** Bootstrapper-классы, реализующие IBootstrap */
  bootstrappers?: Constructor<IBootstrap>[];
}

export const MODULE_METADATA_KEY = "module:metadata";

/**
 * Декоратор модуля, определяет границы фичи и регистрирует провайдеры.
 * Вдохновлён подходом NestJS, но реализован нативно через inversify.
 *
 * @example
 * @Module({
 *   imports: [DatabaseModule],
 *   providers: [UserService, { provide: SOCKET_HANDLER, useClass: UserSocketHandler }],
 *   bootstrappers: [AdminBootstrap],
 * })
 * export class UserModule {}
 */
export function Module(options: ModuleOptions = {}): ClassDecorator {
  return (target: Function) => {
    Reflect.defineMetadata(MODULE_METADATA_KEY, options, target);
  };
}

export function isTokenProvider(p: ModuleProvider): p is TokenProvider {
  return typeof p === "object" && "provide" in p && "useClass" in p;
}
