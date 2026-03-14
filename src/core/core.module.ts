import { TokenVerification } from "./auth/token-verification";
import { Module } from "./decorators/module.decorator";
import { EventBus } from "./event-bus/event-bus";
import { LoggerService } from "./logger/logger.service";

/**
 * Базовые инфраструктурные сервисы: EventBus, Logger, TokenVerification.
 * Импортируется AppModule.
 */
@Module({
  providers: [EventBus, LoggerService, TokenVerification],
})
export class CoreModule {}
