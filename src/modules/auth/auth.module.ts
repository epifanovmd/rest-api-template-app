import { BaseModule, Module } from "../../core";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module(AuthController, AuthService)
export class AuthModule extends BaseModule {}
