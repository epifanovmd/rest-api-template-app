import { Module } from "../../core/decorators/module.decorator";
import { PermissionRepository } from "../permission/permission.repository";
import { RoleRepository } from "../role/role.repository";
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
