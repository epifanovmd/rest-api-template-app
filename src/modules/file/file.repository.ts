import { EntityManager, IsNull, LessThan, MoreThan, Not } from "typeorm";

import { BaseRepository, InjectableRepository, Pagination } from "../../core";
import { FileAccess } from "./file.access";
import { File } from "./file.entity";
import { EFileStatus } from "./file.types";

@InjectableRepository(File)
export class FileRepository extends BaseRepository<File> {
  async findById(id: string): Promise<File | null> {
    return this.findOne({ where: { id } });
  }

  /** Файлы, новые первыми; `ownedBy` — только файлы этого владельца. */
  findPage(
    { ownedBy }: { ownedBy?: string },
    { offset, limit }: Pagination,
  ): Promise<[File[], number]> {
    return this.findAndCount({
      where: ownedBy ? FileAccess.ownedWhere(ownedBy) : {},
      order: { createdAt: "DESC", id: "DESC" },
      skip: offset,
      take: limit,
    });
  }

  /** Неподтверждённые прямые загрузки старше `before`. */
  findStalePending(before: Date, limit: number): Promise<File[]> {
    return this.find({
      where: { status: EFileStatus.Pending, createdAt: LessThan(before) },
      order: { createdAt: "ASC" },
      take: limit,
    });
  }

  /**
   * Бесхозные файлы (владелец снят или удалён) старше `before`, по возрастанию
   * id после `afterId` — кандидаты сборщика мусора.
   */
  findOrphans(
    before: Date,
    afterId: string | null,
    limit: number,
  ): Promise<File[]> {
    return this.find({
      select: { id: true },
      where: {
        ownerId: IsNull(),
        status: Not(EFileStatus.Pending),
        updatedAt: LessThan(before),
        ...(afterId && { id: MoreThan(afterId) }),
      },
      order: { id: "ASC" },
      take: limit,
    });
  }

  /**
   * Атомарный переход статуса с дополнительными полями; `false` — файл
   * удалён или уже не в статусе `from`.
   */
  async transitionStatus(
    id: string,
    from: EFileStatus,
    changes: Partial<File> & { status: EFileStatus },
    manager?: EntityManager,
  ): Promise<boolean> {
    const repo = manager ? manager.getRepository(File) : this;
    const result = await repo.update({ id, status: from }, changes);

    return (result.affected ?? 0) > 0;
  }
}
