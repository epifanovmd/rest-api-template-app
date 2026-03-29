import { inject } from "inversify";
import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Path,
  Post,
  Query,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";

import { getContextUser, Injectable, ValidateBody } from "../../core";
import { KoaRequest } from "../../types/koa";
import { ContactService } from "./contact.service";
import { EContactStatus } from "./contact.types";
import { ContactDto } from "./dto";
import { ICreateContactBody } from "./dto/contact-request.dto";
import { CreateContactSchema } from "./validation";

@Injectable()
@Tags("Contact")
@Route("api/contact")
export class ContactController extends Controller {
  constructor(
    @inject(ContactService) private _contactService: ContactService,
  ) {
    super();
  }

  /**
   * Добавить контакт.
   * @summary Добавление контакта
   */
  @Security("jwt")
  @ValidateBody(CreateContactSchema)
  @Post()
  addContact(
    @Request() req: KoaRequest,
    @Body() body: ICreateContactBody,
  ): Promise<ContactDto> {
    const user = getContextUser(req);

    return this._contactService.addContact(
      user.userId,
      body.contactUserId,
      body.displayName,
    );
  }

  /**
   * Получить список контактов текущего пользователя.
   * @summary Список контактов
   */
  @Security("jwt")
  @Get()
  getContacts(
    @Request() req: KoaRequest,
    @Query() status?: EContactStatus,
  ): Promise<ContactDto[]> {
    const user = getContextUser(req);

    return this._contactService.getContacts(user.userId, status);
  }

  /**
   * Принять запрос на добавление в контакты.
   * @summary Принять контакт
   */
  @Security("jwt")
  @Patch("{id}/accept")
  acceptContact(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<ContactDto> {
    const user = getContextUser(req);

    return this._contactService.acceptContact(user.userId, id);
  }

  /**
   * Удалить контакт.
   * @summary Удаление контакта
   */
  @Security("jwt")
  @Delete("{id}")
  removeContact(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<string> {
    const user = getContextUser(req);

    return this._contactService.removeContact(user.userId, id);
  }

  /**
   * Заблокировать контакт.
   * @summary Блокировка контакта
   */
  @Security("jwt")
  @Post("{id}/block")
  blockContact(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<ContactDto> {
    const user = getContextUser(req);

    return this._contactService.blockContact(user.userId, id);
  }
}
