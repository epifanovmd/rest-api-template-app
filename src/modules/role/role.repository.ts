import { inject, injectable } from "inversify";
import { DataSource, FindOptionsWhere, In, Repository } from "typeorm";

import { Injectable } from "../../core";
import { EPermissions } from "../permission/permission.entity";
import { Permission } from "../permission/permission.entity";
import { ERole, Role } from "./role.entity";

@Injectable()
export class RoleRepository {
  private repository: Repository<Role>;
  private permissionRepository: Repository<Permission>;

  constructor(@inject("DataSource") private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(Role);
    this.permissionRepository = this.dataSource.getRepository(Permission);
  }

  async findById(id: string): Promise<Role | null> {
    return this.repository.findOne({
      where: { id },
      relations: { permissions: true },
    });
  }

  async findByName(name: ERole): Promise<Role | null> {
    return this.repository.findOne({
      where: { name },
      relations: { permissions: true },
    });
  }

  async findAll(): Promise<Role[]> {
    return this.repository.find({
      relations: { permissions: true },
    });
  }

  async create(roleData: Partial<Role>): Promise<Role> {
    const role = this.repository.create(roleData);

    return this.repository.save(role);
  }

  async setPermissions(
    roleId: string,
    permissions: EPermissions[],
  ): Promise<void> {
    const role = await this.findById(roleId);

    if (!role) {
      throw new Error("Role not found");
    }

    // Находим или создаем разрешения
    const permissionEntities = await Promise.all(
      permissions.map(async permissionName => {
        let permission = await this.permissionRepository.findOne({
          where: { name: permissionName },
        });

        if (!permission) {
          permission = this.permissionRepository.create({
            name: permissionName,
          });
          permission = await this.permissionRepository.save(permission);
        }

        return permission;
      }),
    );

    role.permissions = permissionEntities;
    await this.repository.save(role);
  }

  async update(id: string, updateData: Partial<Role>): Promise<Role | null> {
    await this.repository.update(id, updateData);

    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repository.delete(id);

    return (result.affected || 0) > 0;
  }
}
