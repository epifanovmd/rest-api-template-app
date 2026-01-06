import { BaseRepository, InjectableRepository } from "../../core";
import { File } from "./file.entity";

@InjectableRepository(File)
export class FileRepository extends BaseRepository<File> {
  async findById(id: string): Promise<File | null> {
    return this.findOne({ where: { id } });
  }
}
