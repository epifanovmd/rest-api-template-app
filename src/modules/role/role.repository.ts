import { BaseRepository, InjectableRepository } from "../../core";
import { Role } from "./role.entity";
import { TRole } from "./role.types";

/** Репозиторий для работы с ролями. */
@InjectableRepository(Role)
export class RoleRepository extends BaseRepository<Role> {
  /** Найти роль по ID, включая связанные разрешения. */
  async findById(id: string): Promise<Role | null> {
    return this.findOne({
      where: { id },
      relations: { permissions: true },
    });
  }

  /** Найти роль по имени, включая связанные разрешения. */
  async findByName(name: TRole): Promise<Role | null> {
    return this.findOne({
      where: { name },
      relations: { permissions: true },
    });
  }

  /** Получить все роли со связанными разрешениями. */
  async findAll(): Promise<Role[]> {
    return this.find({
      relations: { permissions: true },
    });
  }

  /** Обновить роль и вернуть обновлённую запись с разрешениями. */
  async updateWithResponse(
    id: string,
    updateData: Partial<Role>,
  ): Promise<Role | null> {
    await this.update(id, updateData);

    return this.findById(id);
  }
}
