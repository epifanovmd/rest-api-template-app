import { TokenService } from "./auth";
import { Module } from "./decorators";
import { EventBus } from "./event-bus";
import { LoggerService } from "./logger";

/**
 * Базовые инфраструктурные сервисы: EventBus, Logger, TokenService.
 * Импортируется AppModule.
 */
@Module({
  providers: [EventBus, LoggerService, TokenService],
})
export class CoreModule {}
