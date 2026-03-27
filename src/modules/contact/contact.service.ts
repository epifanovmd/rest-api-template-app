import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@force-dev/utils";
import { inject } from "inversify";
import { DataSource } from "typeorm";

import { EventBus, Injectable } from "../../core";
import { Contact } from "./contact.entity";
import { ContactRepository } from "./contact.repository";
import { EContactStatus } from "./contact.types";
import { ContactDto } from "./dto";
import {
  ContactAcceptedEvent,
  ContactBlockedEvent,
  ContactRemovedEvent,
  ContactRequestEvent,
} from "./events";

@Injectable()
export class ContactService {
  constructor(
    @inject(ContactRepository) private _contactRepo: ContactRepository,
    @inject(EventBus) private _eventBus: EventBus,
    @inject(DataSource) private _dataSource: DataSource,
  ) {}

  async addContact(
    userId: string,
    contactUserId: string,
    displayName?: string,
  ) {
    if (userId === contactUserId) {
      throw new BadRequestException("Нельзя добавить себя в контакты");
    }

    const existing = await this._contactRepo.findByUserPair(
      userId,
      contactUserId,
    );

    if (existing) {
      if (existing.status === EContactStatus.BLOCKED) {
        throw new ForbiddenException("Контакт заблокирован");
      }
      throw new ConflictException("Контакт уже существует");
    }

    // Создаём запись для инициатора (accepted) и для получателя (pending) в транзакции
    const initiatorContactId = await this._dataSource.transaction(
      async manager => {
        const contactRepo = manager.getRepository(Contact);

        const initiatorContact = contactRepo.create({
          userId,
          contactUserId,
          displayName: displayName ?? null,
          status: EContactStatus.ACCEPTED,
        });

        const saved = await contactRepo.save(initiatorContact);

        const recipientContact = contactRepo.create({
          userId: contactUserId,
          contactUserId: userId,
          displayName: null,
          status: EContactStatus.PENDING,
        });

        await contactRepo.save(recipientContact);

        return saved.id;
      },
    );

    const contact = await this._contactRepo.findById(initiatorContactId);
    const dto = ContactDto.fromEntity(contact!);

    this._eventBus.emit(new ContactRequestEvent(dto, contactUserId));

    return dto;
  }

  async acceptContact(userId: string, contactId: string) {
    const contact = await this._contactRepo.findById(contactId);

    if (!contact || contact.userId !== userId) {
      throw new NotFoundException("Контакт не найден");
    }

    if (contact.status !== EContactStatus.PENDING) {
      throw new BadRequestException("Контакт не ожидает подтверждения");
    }

    contact.status = EContactStatus.ACCEPTED;
    await this._contactRepo.save(contact);

    const dto = ContactDto.fromEntity(contact);

    this._eventBus.emit(
      new ContactAcceptedEvent(dto, contact.contactUserId),
    );

    return dto;
  }

  async removeContact(userId: string, contactId: string) {
    const contact = await this._contactRepo.findById(contactId);

    if (!contact || contact.userId !== userId) {
      throw new NotFoundException("Контакт не найден");
    }

    const contactUserId = contact.contactUserId;

    // Удаляем обе стороны связи в транзакции
    await this._dataSource.transaction(async manager => {
      const contactRepo = manager.getRepository(Contact);

      await contactRepo.delete({
        userId,
        contactUserId,
      });
      await contactRepo.delete({
        userId: contactUserId,
        contactUserId: userId,
      });
    });

    this._eventBus.emit(
      new ContactRemovedEvent(userId, contactUserId, contactId),
    );

    return contactId;
  }

  async blockContact(userId: string, contactId: string) {
    const contact = await this._contactRepo.findById(contactId);

    if (!contact || contact.userId !== userId) {
      throw new NotFoundException("Контакт не найден");
    }

    contact.status = EContactStatus.BLOCKED;
    await this._contactRepo.save(contact);

    const dto = ContactDto.fromEntity(contact);

    this._eventBus.emit(
      new ContactBlockedEvent(dto, contact.contactUserId),
    );

    return dto;
  }

  async getContacts(userId: string, status?: EContactStatus) {
    const contacts = await this._contactRepo.findAllForUser(userId, status);

    return contacts.map(ContactDto.fromEntity);
  }
}
