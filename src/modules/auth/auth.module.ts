import { Module } from "../../core/decorators/module.decorator";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  providers: [AuthController, AuthService],
})
export class AuthModule {}
