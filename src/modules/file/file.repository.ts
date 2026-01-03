import { inject, injectable } from "inversify";
import { DataSource, Repository } from "typeorm";

import { Injectable } from "../../core";
import { File } from "./file.entity";

@Injectable()
export class FileRepository {
  private repository: Repository<File>;

  constructor(@inject("DataSource") private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(File);
  }

  async findById(id: string): Promise<File | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByIds(ids: string[]): Promise<File[]> {
    return this.repository.findByIds(ids);
  }

  async create(fileData: Partial<File>): Promise<File> {
    const file = this.repository.create(fileData);

    return this.repository.save(file);
  }

  async createMany(filesData: Partial<File>[]): Promise<File[]> {
    const files = this.repository.create(filesData);

    return this.repository.save(files);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repository.delete(id);

    return (result.affected || 0) > 0;
  }

  async save(file: File): Promise<File> {
    return this.repository.save(file);
  }
}
