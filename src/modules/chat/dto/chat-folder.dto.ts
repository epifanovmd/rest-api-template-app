import { BaseDto } from "../../../core/dto/BaseDto";
import { ChatFolder } from "../chat-folder.entity";

export class ChatFolderDto extends BaseDto {
  id: string;
  userId: string;
  name: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;

  constructor(entity: ChatFolder) {
    super(entity);

    this.id = entity.id;
    this.userId = entity.userId;
    this.name = entity.name;
    this.position = entity.position;
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;
  }

  static fromEntity(entity: ChatFolder) {
    return new ChatFolderDto(entity);
  }
}
