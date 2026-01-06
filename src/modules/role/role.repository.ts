import { BaseRepository, InjectableRepository } from "../../core";
import { Role } from "./role.entity";
import { ERole } from "./role.types";

@InjectableRepository(Role)
export class RoleRepository extends BaseRepository<Role> {
  async findById(id: string): Promise<Role | null> {
    return this.findOne({
      where: { id },
      relations: { permissions: true },
    });
  }

  async findByName(name: ERole): Promise<Role | null> {
    return this.findOne({
      where: { name },
      relations: { permissions: true },
    });
  }

  async findAll(): Promise<Role[]> {
    return this.find({
      relations: { permissions: true },
    });
  }

  async updateWithResponse(
    id: string,
    updateData: Partial<Role>,
  ): Promise<Role | null> {
    await this.update(id, updateData);

    return this.findById(id);
  }
}
