import { Module } from "../../core";
import { LinkPreviewRepository } from "./link-preview.repository";
import { LinkPreviewService } from "./link-preview.service";

@Module({
  providers: [LinkPreviewRepository, LinkPreviewService],
})
export class LinkPreviewModule {}
