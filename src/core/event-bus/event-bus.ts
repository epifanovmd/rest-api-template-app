import { Injectable } from "../decorators";
import { logger } from "../logger";

type Constructor<T> = new (...args: any[]) => T;
type Handler<T> = (event: T) => void | Promise<void>;

@Injectable()
export class EventBus {
  private readonly handlers = new Map<string, Set<Handler<any>>>();

  emit<T extends object>(event: T): void {
    const name = event.constructor.name;
    const handlers = this.handlers.get(name);

    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      try {
        const result = handler(event);

        if (result instanceof Promise) {
          result.catch(err =>
            logger.error({ err }, `[EventBus] Handler error for "${name}"`),
          );
        }
      } catch (err) {
        logger.error({ err }, `[EventBus] Handler error for "${name}"`);
      }
    }
  }

  async emitAsync<T extends object>(event: T): Promise<void> {
    const name = event.constructor.name;
    const handlers = this.handlers.get(name);

    if (!handlers) {
      return;
    }

    await Promise.all([...handlers].map(handler => handler(event)));
  }

  on<T extends object>(
    EventClass: Constructor<T>,
    handler: Handler<T>,
  ): () => void {
    const name = EventClass.name;

    if (!this.handlers.has(name)) {
      this.handlers.set(name, new Set());
    }

    this.handlers.get(name)!.add(handler);

    return () => this.off(EventClass, handler);
  }

  off<T extends object>(
    EventClass: Constructor<T>,
    handler: Handler<T>,
  ): void {
    this.handlers.get(EventClass.name)?.delete(handler);
  }
}
