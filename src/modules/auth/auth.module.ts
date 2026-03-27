import { Module } from "../../core/decorators/module.decorator";
import { asSocketListener } from "../socket";
import { AuthController } from "./auth.controller";
import { AuthListener } from "./auth.listener";
import { AuthService } from "./auth.service";

@Module({
  providers: [AuthController, AuthService, asSocketListener(AuthListener)],
})
export class AuthModule {}
