import { BaseDto } from "../../../core/dto/BaseDto";
import { PublicUserDto } from "../../user/dto";
import { DialogMembers } from "../dialog-members.entity";

export class DialogMembersDto extends BaseDto {
  id: string;
  userId: string;
  dialogId: string;
  createdAt: Date;
  updatedAt: Date;
  user: PublicUserDto;

  constructor(entity: DialogMembers) {
    super(entity);

    this.id = entity.id;
    this.userId = entity.userId;
    this.dialogId = entity.dialogId;
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;
    this.user = PublicUserDto.fromEntity(entity.user);
  }

  static fromEntity(entity: DialogMembers) {
    return new DialogMembersDto(entity);
  }
}
