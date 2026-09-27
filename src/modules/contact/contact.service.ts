import { inject } from "inversify";
import { DataSource } from "typeorm";

import {
  EventBus,
  Injectable,
  IPaginatedDto,
  normalizePagination,
  toPage,
} from "../../core";
import { FileUrlService } from "../file";
import { Contact } from "./contact.entity";
import { ContactError } from "./contact.errors";
import { ContactRepository } from "./contact.repository";
import { EContactStatus } from "./contact.types";
import { collectContactFiles, ContactDto } from "./dto";
import {
  ContactAcceptedEvent,
  ContactBlockedEvent,
  ContactRemovedEvent,
  ContactRequestEvent,
  ContactUnblockedEvent,
} from "./events";
import { UserBlockService } from "./user-block.service";

const CONTACT_STATUSES = Object.values(EContactStatus) as string[];

@Injectable()
export class ContactService {
  constructor(
    @inject(ContactRepository) private _contactRepo: ContactRepository,
    @inject(EventBus) private _eventBus: EventBus,
    @inject(DataSource) private _dataSource: DataSource,
    @inject(UserBlockService) private _userBlock: UserBlockService,
    @inject(FileUrlService) private _fileUrls: FileUrlService,
  ) {}

  async addContact(
    userId: string,
    contactUserId: string,
    displayName?: string,
  ) {
    if (userId === contactUserId) {
      throw ContactError.SELF();
    }

    await this.assertUserExists(contactUserId);

    if (await this._userBlock.isBlockedEither(userId, contactUserId)) {
      throw ContactError.BLOCKED();
    }

    const existing = await this._contactRepo.findByUserPair(
      userId,
      contactUserId,
    );

    if (existing) {
      throw ContactError.ALREADY_EXISTS();
    }

    // Инициатор — ACCEPTED, получатель — PENDING (если у него ещё нет записи)
    const initiatorContactId = await this._dataSource.transaction(
      async manager => {
        const contactRepo = manager.getRepository(Contact);

        const saved = await contactRepo.save(
          contactRepo.create({
            userId,
            contactUserId,
            displayName: displayName ?? null,
            status: EContactStatus.ACCEPTED,
          }),
        );

        const reverse = await contactRepo.findOne({
          where: { userId: contactUserId, contactUserId: userId },
        });

        if (!reverse) {
          await contactRepo.save(
            contactRepo.create({
              userId: contactUserId,
              contactUserId: userId,
              displayName: null,
              status: EContactStatus.PENDING,
            }),
          );
        }

        return saved.id;
      },
    );

    const dto = await this.requireContactDto(initiatorContactId);

    this._eventBus.emit(new ContactRequestEvent(dto, contactUserId));

    return dto;
  }

  async acceptContact(userId: string, contactId: string) {
    const contact = await this._contactRepo.findById(contactId);

    if (!contact || contact.userId !== userId) {
      throw ContactError.NOT_FOUND();
    }

    if (contact.status !== EContactStatus.PENDING) {
      throw ContactError.NOT_PENDING();
    }

    contact.status = EContactStatus.ACCEPTED;
    await this._contactRepo.save(contact);

    const dto = await this.toDto(contact);

    this._eventBus.emit(new ContactAcceptedEvent(dto, contact.contactUserId));

    return dto;
  }

  /**
   * Удаление контакта с обеих сторон. Встречная BLOCKED-строка сохраняется:
   * удаление контакта не снимает блокировку, поставленную собеседником.
   */
  async removeContact(userId: string, contactId: string): Promise<void> {
    const contact = await this._contactRepo.findById(contactId);

    if (!contact || contact.userId !== userId) {
      throw ContactError.NOT_FOUND();
    }

    if (contact.status === EContactStatus.BLOCKED) {
      throw ContactError.REMOVE_BLOCKED();
    }

    const contactUserId = contact.contactUserId;

    await this._dataSource.transaction(async manager => {
      const contactRepo = manager.getRepository(Contact);

      await contactRepo.delete({ id: contact.id });

      const reverse = await contactRepo.findOne({
        where: { userId: contactUserId, contactUserId: userId },
      });

      if (reverse && reverse.status !== EContactStatus.BLOCKED) {
        await contactRepo.delete({ id: reverse.id });
      }
    });

    this._eventBus.emit(
      new ContactRemovedEvent(userId, contactUserId, contactId),
    );
  }

  /**
   * Заблокировать пользователя. Блокировка хранится как BLOCKED-строка
   * контакта блокирующего; создаётся, если контакта не было. Идемпотентно.
   */
  async blockUser(userId: string, targetUserId: string): Promise<void> {
    if (userId === targetUserId) {
      throw ContactError.SELF(undefined, "Нельзя заблокировать себя");
    }

    await this.assertUserExists(targetUserId);

    const existing = await this._contactRepo.findByUserPair(
      userId,
      targetUserId,
    );

    if (existing?.status === EContactStatus.BLOCKED) return;

    let dto: ContactDto;

    if (existing) {
      existing.status = EContactStatus.BLOCKED;
      await this._contactRepo.save(existing);
      dto = await this.toDto(existing);
    } else {
      const created = await this._contactRepo.createAndSave({
        userId,
        contactUserId: targetUserId,
        displayName: null,
        status: EContactStatus.BLOCKED,
      });

      dto = await this.requireContactDto(created.id);
    }

    this._eventBus.emit(new ContactBlockedEvent(dto, targetUserId));
  }

  /** Снять блокировку: BLOCKED-строка удаляется, контакт нужно добавить заново. */
  async unblockUser(userId: string, targetUserId: string): Promise<void> {
    const contact = await this._contactRepo.findByUserPair(
      userId,
      targetUserId,
    );

    if (!contact || contact.status !== EContactStatus.BLOCKED) {
      throw ContactError.NOT_BLOCKED();
    }

    await this._contactRepo.delete({ id: contact.id });

    this._eventBus.emit(
      new ContactUnblockedEvent(await this.toDto(contact), targetUserId),
    );
  }

  async getContacts(
    userId: string,
    status?: EContactStatus,
    offset?: number,
    limit?: number,
  ): Promise<IPaginatedDto<ContactDto>> {
    if (status !== undefined && !CONTACT_STATUSES.includes(status)) {
      throw ContactError.INVALID_STATUS(
        { allowed: CONTACT_STATUSES },
        `Недопустимый статус: ожидается один из ${CONTACT_STATUSES.join(", ")}`,
      );
    }

    const page = normalizePagination(offset, limit);
    const [contacts, total] = await this._contactRepo.findAllForUser(
      userId,
      status,
      page.offset,
      page.limit,
    );

    const dtos = await this._fileUrls.buildWithFiles(
      contacts,
      collectContactFiles,
      ContactDto.fromEntity,
    );

    return toPage(dtos, total, page);
  }

  private async assertUserExists(userId: string) {
    if (!(await this._contactRepo.userExists(userId))) {
      throw ContactError.USER_NOT_FOUND();
    }
  }

  private async requireContactDto(contactId: string) {
    const contact = await this._contactRepo.findById(contactId);

    if (!contact) {
      throw ContactError.NOT_FOUND();
    }

    return this.toDto(contact);
  }

  private toDto(contact: Contact): Promise<ContactDto> {
    return this._fileUrls.buildOneWithFiles(
      contact,
      collectContactFiles,
      ContactDto.fromEntity,
    );
  }
}
