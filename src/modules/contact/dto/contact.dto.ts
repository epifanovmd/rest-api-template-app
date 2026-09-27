import { BaseDto } from "../../../core/dto/BaseDto";
import type { TFileRef, TSignedFiles } from "../../file";
import { collectProfileFiles, PublicProfileDto } from "../../profile/dto";
import { Contact } from "../contact.entity";
import { EContactStatus } from "../contact.types";

/** Аватары контактов — для подписи пачкой перед сборкой `ContactDto`. */
export const collectContactFiles = (
  contacts: ReadonlyArray<Contact | null | undefined>,
): TFileRef[] =>
  collectProfileFiles(contacts.map(contact => contact?.contactUser?.profile));

/** Контакт; ссылка на аватар профиля — из карты подписей `files`. */
export class ContactDto extends BaseDto {
  id: string;
  userId: string;
  contactUserId: string;
  displayName: string | null;
  status: EContactStatus;
  createdAt: Date;
  updatedAt: Date;
  contactProfile?: PublicProfileDto;

  constructor(entity: Contact, files: TSignedFiles) {
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
        files,
      );
    }
  }

  static fromEntity(entity: Contact, files: TSignedFiles) {
    return new ContactDto(entity, files);
  }
}
