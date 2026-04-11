import { Module } from "../../core";
import { PermissionRepository } from "../permission";
import { RoleController, RoleRepository, RoleService } from "../role";
import { asSocketListener } from "../socket";
import { AdminBootstrap } from "./admin.bootstrap";
import { SeedBootstrap } from "./seed.bootstrap";
import { UserController } from "./user.controller";
import { UserListener } from "./user.listener";
import { UserRepository } from "./user.repository";
import { UserService } from "./user.service";

@Module({
  providers: [
    UserRepository,
    RoleRepository,
    RoleService,
    RoleController,
    PermissionRepository,
    UserController,
    UserService,
    asSocketListener(UserListener),
  ],
  bootstrappers: [AdminBootstrap, SeedBootstrap],
})
export class UserModule {}
