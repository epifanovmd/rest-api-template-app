import { Module } from "../core/decorators/module.decorator";
import { DatabaseBootstrap } from "./database.bootstrap";

/**
 * Инициализирует TypeORM DataSource.
 * Должен быть первым в списке imports AppModule.
 */
@Module({
  bootstrappers: [DatabaseBootstrap],
})
export class DatabaseModule {}
