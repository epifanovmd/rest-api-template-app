import { Module } from "../../core/decorators/module.decorator";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";

@Module({
  providers: [UserController, UserService],
})
export class UserModule {}
