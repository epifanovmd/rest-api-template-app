import { BaseRepository, InjectableRepository } from "../../core";
import { Permission } from "./permission.entity";
import { TPermission } from "./permission.types";

/** Репозиторий для работы с разрешениями (permissions). */
@InjectableRepository(Permission)
export class PermissionRepository extends BaseRepository<Permission> {
  /** Найти разрешение по его уникальному имени. */
  async findByName(name: TPermission): Promise<Permission | null> {
    return this.findOne({ where: { name } });
  }

  /** Получить все разрешения, включая связанные роли. */
  async findAll(): Promise<Permission[]> {
    return this.find({ relations: { roles: true } });
  }
}
