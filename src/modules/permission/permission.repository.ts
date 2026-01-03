import { inject, injectable } from "inversify";
import { DataSource, Repository } from "typeorm";

import { Injectable } from "../../core";
import { EPermissions, Permission } from "./permission.entity";

@Injectable()
export class PermissionRepository {
  private repository: Repository<Permission>;

  constructor(@inject("DataSource") private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(Permission);
  }

  async findByName(name: EPermissions): Promise<Permission | null> {
    return this.repository.findOne({ where: { name } });
  }

  async findAll(): Promise<Permission[]> {
    return this.repository.find({ relations: { roles: true } });
  }

  async create(permissionData: Partial<Permission>): Promise<Permission> {
    const permission = this.repository.create(permissionData);

    return this.repository.save(permission);
  }

  async save(permission: Permission): Promise<Permission> {
    return this.repository.save(permission);
  }
}
