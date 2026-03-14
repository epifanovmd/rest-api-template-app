import { Module } from "../../core/decorators/module.decorator";
import { AdminBootstrap } from "./admin.bootstrap";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";

@Module({
  providers: [UserController, UserService],
  bootstrappers: [AdminBootstrap],
})
export class UserModule {}
