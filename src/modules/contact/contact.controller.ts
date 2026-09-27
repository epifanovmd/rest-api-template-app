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
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "tsoa";

import type { IErrorResponseDto, IPaginatedDto } from "../../core";
import {
  getContextUser,
  Injectable,
  ValidateBody,
  ValidateQuery,
} from "../../core";
import { UUID } from "../../core/http";
import { KoaRequest } from "../../types/koa";
import { ContactService } from "./contact.service";
import { EContactStatus } from "./contact.types";
import { ContactDto } from "./dto";
import { ICreateContactBody } from "./dto/contact-request.dto";
import { CreateContactSchema, GetContactsQuerySchema } from "./validation";

@Injectable()
@Tags("Contact")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/contact")
export class ContactController extends Controller {
  constructor(@inject(ContactService) private _contactService: ContactService) {
    super();
  }

  /**
   * Добавить контакт. Недоступно, если один из пользователей заблокировал
   * другого (403).
   * @summary Добавление контакта
   */
  @Security("jwt")
  @ValidateBody(CreateContactSchema)
  @SuccessResponse(201, "Created")
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
   * Контакты текущего пользователя постранично. `status=blocked` —
   * список заблокированных.
   * @summary Список контактов
   * @param offset Смещение (по умолчанию 0)
   * @param limit Размер страницы (по умолчанию 20, максимум 100)
   */
  @Security("jwt")
  @ValidateQuery(GetContactsQuerySchema)
  @Get()
  getContacts(
    @Request() req: KoaRequest,
    @Query() status?: EContactStatus,
    @Query() offset?: number,
    @Query() limit?: number,
  ): Promise<IPaginatedDto<ContactDto>> {
    const user = getContextUser(req);

    return this._contactService.getContacts(user.userId, status, offset, limit);
  }

  /**
   * Заблокировать пользователя (идемпотентно). Заблокированный не может
   * писать, звонить, создавать личный чат и добавлять в группы/контакты.
   * @summary Блокировка пользователя
   */
  @Security("jwt")
  @SuccessResponse(204, "No Content")
  @Post("block/{userId}")
  async blockUser(
    @Request() req: KoaRequest,
    @Path() userId: UUID,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._contactService.blockUser(user.userId, userId);
  }

  /**
   * Снять блокировку пользователя. Контакт при этом не восстанавливается.
   * @summary Разблокировка пользователя
   */
  @Security("jwt")
  @SuccessResponse(204, "No Content")
  @Delete("block/{userId}")
  async unblockUser(
    @Request() req: KoaRequest,
    @Path() userId: UUID,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._contactService.unblockUser(user.userId, userId);
  }

  /**
   * Принять запрос на добавление в контакты.
   * @summary Принять контакт
   */
  @Security("jwt")
  @Patch("{id}/accept")
  acceptContact(
    @Request() req: KoaRequest,
    @Path() id: UUID,
  ): Promise<ContactDto> {
    const user = getContextUser(req);

    return this._contactService.acceptContact(user.userId, id);
  }

  /**
   * Удалить контакт (обе стороны связи). Блокировку, поставленную
   * собеседником, удаление не снимает; свою — только разблокировкой (409).
   * @summary Удаление контакта
   */
  @Security("jwt")
  @SuccessResponse(204, "No Content")
  @Delete("{id}")
  async removeContact(
    @Request() req: KoaRequest,
    @Path() id: UUID,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._contactService.removeContact(user.userId, id);
  }
}
