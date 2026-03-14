import { TokenService } from "./auth/token.service";
import { Module } from "./decorators/module.decorator";
import { EventBus } from "./event-bus/event-bus";
import { LoggerService } from "./logger/logger.service";

/**
 * Базовые инфраструктурные сервисы: EventBus, Logger, TokenService.
 * Импортируется AppModule.
 */
@Module({
  providers: [EventBus, LoggerService, TokenService],
})
export class CoreModule {}
