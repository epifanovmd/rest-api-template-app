import { Container, decorate, injectable } from "inversify";
import { DataSource } from "typeorm";

import { BOOTSTRAP, IBootstrap } from "./bootstrap";
import { REPOSITORY_ENTITY_KEY } from "./decorators/repository.decoration";
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
 * - регистрацию обычных провайдеров (класс или token-binding)
 * - регистрацию репозиториев через toDynamicValue (DataSource + entity)
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
      // Привязка по символу/токену — поддерживает multi-inject
      this.ensureInjectable(provider.useClass);
      this.container
        .bind(provider.provide)
        .to(provider.useClass)
        .inSingletonScope();
    } else if (this.isRepositoryClass(provider)) {
      // Репозиторий TypeORM: toDynamicValue получает DataSource из контейнера
      // и передаёт entity-класс из метаданных декоратора @InjectableRepository
      if (this.container.isBound(provider)) return;

      const entity = Reflect.getMetadata(REPOSITORY_ENTITY_KEY, provider);

      this.ensureInjectable(provider);
      this.container
        .bind(provider)
        .toDynamicValue(
          ctx => new provider(ctx.container.get(DataSource), entity),
        )
        .inSingletonScope();
    } else {
      // Привязка класса к самому себе (singleton)
      if (this.container.isBound(provider)) return;

      this.ensureInjectable(provider);
      this.container.bind(provider).toSelf().inSingletonScope();
    }
  }

  private isRepositoryClass(provider: Constructor): boolean {
    return Reflect.hasMetadata(REPOSITORY_ENTITY_KEY, provider);
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
