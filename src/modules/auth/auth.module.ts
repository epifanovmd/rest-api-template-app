import { AdminBootstrap } from "../../bootstrap/admin.bootstrap";
import { Module } from "../../core/decorators/module.decorator";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  providers: [AuthController, AuthService],
  bootstrappers: [AdminBootstrap],
})
export class AuthModule {}
