import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@force-dev/utils";
import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ContactRepository } from "./contact.repository";
import { EContactStatus } from "./contact.types";
import { ContactDto } from "./dto";
import { ContactAcceptedEvent, ContactRequestEvent } from "./events";

@Injectable()
export class ContactService {
  constructor(
    @inject(ContactRepository) private _contactRepo: ContactRepository,
    @inject(EventBus) private _eventBus: EventBus,
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

    // Создаём запись для инициатора (accepted) и для получателя (pending)
    const initiatorContact = await this._contactRepo.createAndSave({
      userId,
      contactUserId,
      displayName: displayName ?? null,
      status: EContactStatus.ACCEPTED,
    });

    await this._contactRepo.createAndSave({
      userId: contactUserId,
      contactUserId: userId,
      displayName: null,
      status: EContactStatus.PENDING,
    });

    const contact = await this._contactRepo.findById(initiatorContact.id);
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

    // Удаляем обе стороны связи
    await this._contactRepo.delete({
      userId,
      contactUserId: contact.contactUserId,
    });
    await this._contactRepo.delete({
      userId: contact.contactUserId,
      contactUserId: userId,
    });

    return contactId;
  }

  async blockContact(userId: string, contactId: string) {
    const contact = await this._contactRepo.findById(contactId);

    if (!contact || contact.userId !== userId) {
      throw new NotFoundException("Контакт не найден");
    }

    contact.status = EContactStatus.BLOCKED;
    await this._contactRepo.save(contact);

    return ContactDto.fromEntity(contact);
  }

  async getContacts(userId: string, status?: EContactStatus) {
    const contacts = await this._contactRepo.findAllForUser(userId, status);

    return contacts.map(ContactDto.fromEntity);
  }
}
