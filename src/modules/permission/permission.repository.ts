import { BaseRepository, InjectableRepository } from "../../core";
import { Permission } from "./permission.entity";
import { EPermissions } from "./permission.types";

@InjectableRepository(Permission)
export class PermissionRepository extends BaseRepository<Permission> {
  async findByName(name: EPermissions): Promise<Permission | null> {
    return this.findOne({ where: { name } });
  }

  async findAll(): Promise<Permission[]> {
    return this.find({ relations: { roles: true } });
  }
}
