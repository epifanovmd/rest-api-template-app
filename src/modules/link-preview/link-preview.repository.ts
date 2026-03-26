import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { LinkPreview } from "./link-preview.entity";

@InjectableRepository(LinkPreview)
export class LinkPreviewRepository extends BaseRepository<LinkPreview> {
  async findByUrl(url: string): Promise<LinkPreview | null> {
    return this.findOne({ where: { url } });
  }
}
