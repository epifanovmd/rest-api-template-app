import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("link_previews")
@Index("IDX_LINK_PREVIEWS_URL", ["url"], { unique: true })
export class LinkPreview {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 2048, unique: true })
  url: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  title: string | null;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ name: "image_url", type: "varchar", length: 2048, nullable: true })
  imageUrl: string | null;

  @Column({ name: "site_name", type: "varchar", length: 200, nullable: true })
  siteName: string | null;

  @Column({ name: "fetched_at", type: "timestamp" })
  fetchedAt: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
