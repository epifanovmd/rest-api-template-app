import { Container, interfaces } from "inversify";

type Constructor<T = any> = new (...args: any[]) => T;

export const Module = (...providers: Constructor[]): ClassDecorator => {
  return (target: Function) => {
    Reflect.defineMetadata("module:providers", providers, target);
  };
};

export class BaseModule {
  protected container: Container;

  constructor(container?: Container) {
    this.container = container || new Container();
  }

  /**
   * Конфигурирует контейнер с провайдерами модуля
   */
  configure(container: Container = this.container): void {
    const providers = this.getProviders();

    providers.forEach(provider => {
      this.bindProvider(container, provider);
    });

    this.onConfigure(container);
  }

  /**
   * Возвращает провайдеры модуля из метаданных
   */
  protected getProviders(): Constructor[] {
    return Reflect.getMetadata("module:providers", this.constructor) || [];
  }

  /**
   * Регистрирует провайдер в контейнере
   */
  protected bindProvider(container: Container, provider: Constructor): void {
    if (!container.isBound(provider)) {
      container.bind(provider).toSelf().inSingletonScope();
    }
  }

  /**
   * Хук для дополнительной конфигурации после регистрации провайдеров
   */
  protected onConfigure(container: Container): void {
    // Переопределяется в наследниках для дополнительной конфигурации
  }

  /**
   * Получает экземпляр провайдера из контейнера
   */
  get<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>): T {
    return this.container.get(serviceIdentifier);
  }

  /**
   * Проверяет, зарегистрирован ли провайдер
   */
  has(serviceIdentifier: interfaces.ServiceIdentifier): boolean {
    return this.container.isBound(serviceIdentifier);
  }
}
