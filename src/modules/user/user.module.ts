import { Module } from "../../core";
import { PermissionRepository } from "../permission";
import { RoleRepository } from "../role";
import { AdminBootstrap } from "./admin.bootstrap";
import { UserController } from "./user.controller";
import { UserRepository } from "./user.repository";
import { UserService } from "./user.service";

@Module({
  providers: [
    UserRepository,
    RoleRepository,
    PermissionRepository,
    UserController,
    UserService,
  ],
  bootstrappers: [AdminBootstrap],
})
export class UserModule {}
