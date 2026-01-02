// src/modules/users/users.module.ts
import { ContainerModule } from "inversify";

import { User } from "./user.entity";
import { UsersController } from "./users.controller";
import { UsersRepository } from "./users.repository";
import { UsersService } from "./users.service";

export const UsersModule = new ContainerModule(bind => {
  // Entities (для TypeORM)
  bind("UserEntity").toConstantValue(User);

  // Репозиторий
  bind<UsersRepository>(UsersRepository).toSelf().inRequestScope();

  // Сервисы
  bind<UsersService>(UsersService).toSelf().inRequestScope();

  // Контроллеры
  bind<UsersController>(UsersController).toSelf().inRequestScope();
});

// Export типы для использования в других модулях
export * from "./user.entity";
export * from "./users.service";
