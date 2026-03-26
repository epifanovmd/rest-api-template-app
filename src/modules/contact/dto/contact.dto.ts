import { IListResponseDto } from "../../../core";
import { BaseDto } from "../../../core/dto/BaseDto";
import { PublicProfileDto } from "../../profile/dto";
import { Contact } from "../contact.entity";
import { EContactStatus } from "../contact.types";

export class ContactDto extends BaseDto {
  id: string;
  userId: string;
  contactUserId: string;
  displayName: string | null;
  status: EContactStatus;
  createdAt: Date;
  updatedAt: Date;
  contactProfile?: PublicProfileDto;

  constructor(entity: Contact) {
    super(entity);

    this.id = entity.id;
    this.userId = entity.userId;
    this.contactUserId = entity.contactUserId;
    this.displayName = entity.displayName;
    this.status = entity.status;
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;

    if (entity.contactUser?.profile) {
      this.contactProfile = PublicProfileDto.fromEntity(
        entity.contactUser.profile,
      );
    }
  }

  static fromEntity(entity: Contact) {
    return new ContactDto(entity);
  }
}

export interface IContactListDto extends IListResponseDto<ContactDto[]> {}
