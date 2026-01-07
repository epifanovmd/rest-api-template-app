import { BaseDto } from "../../../core/dto/BaseDto";
import { DialogMessages } from "../dialog-messages.entity";

export class DialogLastMessagesDto extends BaseDto {
  id: string;
  text: string;
  received?: boolean;
  createdAt: Date;
  updatedAt: Date;

  constructor(entity: DialogMessages) {
    super(entity);

    this.id = entity.id;
    this.text = entity.text;
    this.received = entity.received;
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;
  }

  static fromEntity(entity: DialogMessages) {
    return new DialogLastMessagesDto(entity);
  }
}
