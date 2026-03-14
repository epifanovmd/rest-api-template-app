import { Container, decorate, injectable } from "inversify";

import { BOOTSTRAP, IBootstrap } from "./bootstrap";
import {
  isTokenProvider,
  MODULE_METADATA_KEY,
  ModuleOptions,
  ModuleProvider,
} from "./decorators";

type Constructor<T = any> = new (...args: any[]) => T;

/**
 * ModuleLoader обходит дерево модулей и регистрирует их провайдеры
 * в IoC контейнере. Поддерживает:
 * - импорт зависимых модулей (depth-first, без дублей)
 * - регистрацию провайдеров (класс или token-binding)
 * - регистрацию bootstrapper-ов через символ BOOTSTRAP
 */
export class ModuleLoader {
  private readonly loaded = new Set<Constructor>();

  constructor(private readonly container: Container) {}

  load(ModuleClass: Constructor): void {
    if (this.loaded.has(ModuleClass)) {
      return;
    }

    this.loaded.add(ModuleClass);

    const options: ModuleOptions =
      Reflect.getMetadata(MODULE_METADATA_KEY, ModuleClass) ?? {};

    // Рекурсивно загружаем импортируемые модули
    for (const Imported of options.imports ?? []) {
      this.load(Imported);
    }

    // Регистрируем провайдеры
    for (const provider of options.providers ?? []) {
      this.bindProvider(provider);
    }

    // Регистрируем bootstrapper-ы
    for (const Bootstrapper of options.bootstrappers ?? []) {
      this.ensureInjectable(Bootstrapper);
      this.container
        .bind<IBootstrap>(BOOTSTRAP)
        .to(Bootstrapper)
        .inSingletonScope();
    }
  }

  private bindProvider(provider: ModuleProvider): void {
    if (isTokenProvider(provider)) {
      this.ensureInjectable(provider.useClass);
      this.container
        .bind(provider.provide)
        .to(provider.useClass)
        .inSingletonScope();
    } else if (!this.container.isBound(provider)) {
      this.ensureInjectable(provider);
      this.container.bind(provider).toSelf().inSingletonScope();
    }
  }

  /**
   * Безопасно применяет @injectable() к классу, если он ещё не помечен.
   * Нужно для классов, которые не используют @Injectable() декоратор.
   */
  private ensureInjectable(target: Constructor): void {
    try {
      decorate(injectable(), target);
    } catch {
      // Уже помечен как injectable — игнорируем
    }
  }
}
