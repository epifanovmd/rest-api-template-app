import { inject, injectable } from "inversify";
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

import { getContextUser } from "../../common";
import { Injectable } from "../../core";
import { KoaRequest } from "../../types/koa";
import { DialogMembersService } from "../dialog-members";
import {
  DialogMembersAddRequest,
  DialogMembersDto,
} from "../dialog-members/dialog-members.model";
import { DialogMessagesService } from "../dialog-messages";
import {
  IDialogListMessagesDto,
  IDialogMessagesDto,
  IMessagesRequest,
  IMessagesUpdateRequest,
} from "../dialog-messages/dialog-messages.model";
import {
  DialogCreateRequest,
  DialogDto,
  DialogFindRequest,
  IDialogListDto,
} from "./dialog.model";
import { DialogService } from "./dialog.service";

@Injectable()
@Tags("Dialog")
@Route("api/dialog")
export class DialogController extends Controller {
  constructor(
    @inject(DialogService) private _dialogService: DialogService,
    @inject(DialogMembersService)
    private _dialogMembersService: DialogMembersService,
    @inject(DialogMessagesService)
    private _dialogMessagesService: DialogMessagesService,
  ) {
    super();
  }

  /**
   * Получает количество непрочитанных сообщений пользователя.
   *
   * @summary Количество непрочитанных сообщений
   * @param req Запрос с JWT-токеном.
   * @param dialogId ID диалога (необязательно, если указано, то считает непрочитанные в конкретном диалоге).
   * @returns Количество непрочитанных сообщений.
   */
  @Security("jwt")
  @Get("unread-messages-count")
  getUnreadMessagesCount(
    @Request() req: KoaRequest,
    @Query("dialogId") dialogId?: string,
  ): Promise<number> {
    const user = getContextUser(req);

    return this._dialogService.getUnreadMessagesCount(user.id, dialogId);
  }

  /**
   * Получает список всех диалогов пользователя.
   *
   * @summary Список диалогов
   * @param req Запрос с JWT-токеном.
   * @param offset Смещение (пагинация).
   * @param limit Количество элементов (пагинация).
   * @returns Список диалогов пользователя.
   */
  @Security("jwt")
  @Get("all")
  async getDialogs(
    @Request() req: KoaRequest,
    @Query("offset") offset?: number,
    @Query("limit") limit?: number,
  ): Promise<IDialogListDto> {
    const user = getContextUser(req);
    const data = await this._dialogService.getDialogs(user.id);

    return {
      offset,
      limit,
      count: data.length,
      data,
    };
  }

  /**
   * Получает информацию о конкретном диалоге по ID.
   *
   * @summary Информация о диалоге
   * @param req Запрос с JWT-токеном.
   * @param id ID диалога.
   * @returns Объект диалога.
   */
  @Security("jwt")
  @Get("/info/{id}")
  getDialogById(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<DialogDto> {
    const user = getContextUser(req);

    return this._dialogService.getDialog(id, user.id);
  }

  /**
   * Ищет диалог между текущим пользователем и другим участником.
   *
   * @summary Поиск диалога
   * @param req Запрос с JWT-токеном.
   * @param body Данные поиска (ID получателя).
   * @returns Массив найденных ID диалогов.
   */
  @Security("jwt")
  @Post("/find")
  findDialog(
    @Request() req: KoaRequest,
    @Body() body: DialogFindRequest,
  ): Promise<string[]> {
    const user = getContextUser(req);

    return this._dialogService.findDialog(user.id, body.recipientId);
  }

  /**
   * Создает новый диалог.
   *
   * @summary Создание диалога
   * @param req Запрос с JWT-токеном.
   * @param body Данные для создания диалога.
   * @returns Созданный диалог.
   */
  @Security("jwt")
  @Post()
  createDialog(
    @Request() req: KoaRequest,
    @Body() body: DialogCreateRequest,
  ): Promise<DialogDto> {
    const user = getContextUser(req);

    return this._dialogService.createDialog(user.id, body);
  }

  /**
   * Получает список участников диалога.
   *
   * @summary Участники диалога
   * @param dialogId ID диалога.
   * @returns Список участников.
   */
  @Security("jwt")
  @Get("/members")
  getMembers(@Query("dialogId") dialogId: string): Promise<DialogMembersDto[]> {
    return this._dialogMembersService.getMembers(dialogId);
  }

  /**
   * Добавляет новых участников в диалог.
   *
   * @summary Добавление участников
   * @param req Запрос с JWT-токеном.
   * @param body Данные с ID диалога и участниками.
   * @returns Список обновленных участников.
   */
  @Security("jwt")
  @Post("/member")
  addMembers(
    @Request() req: KoaRequest,
    @Body() body: DialogMembersAddRequest,
  ): Promise<DialogMembersDto[]> {
    const user = getContextUser(req);

    return this._dialogMembersService.addMembers({
      userId: user.id,
      dialogId: body.dialogId,
      members: body.members,
    });
  }

  /**
   * Удаляет участника из диалога.
   *
   * @summary Удаление участника
   * @param id ID участника.
   */
  @Security("jwt")
  @Delete("/member/{id}")
  deleteMember(@Path() id: string): Promise<void> {
    return this._dialogMembersService.deleteMember(id);
  }

  /**
   * Удаляет диалог.
   *
   * @summary Удаление диалога
   * @param id ID диалога.
   */
  @Security("jwt")
  @Delete("/{id}")
  removeDialog(@Path() id: string): Promise<void> {
    return this._dialogService.removeDialog(id);
  }

  /**
   * Получает сообщения диалога с пагинацией.
   *
   * @summary Получение сообщений
   * @param dialogId ID диалога.
   * @param offset Смещение.
   * @param limit Количество сообщений.
   * @returns Список сообщений.
   */
  @Security("jwt")
  @Get("/message/all")
  async getMessages(
    @Query("dialogId") dialogId: string,
    @Query("offset") offset?: number,
    @Query("limit") limit?: number,
  ): Promise<IDialogListMessagesDto> {
    const data = await this._dialogMessagesService.getAllMessages(
      dialogId,
      offset,
      limit,
    );

    return {
      offset,
      limit,
      count: data.length,
      data,
    };
  }

  /**
   * Получает последнее сообщение в диалоге.
   *
   * @summary Последнее сообщение
   * @param dialogId ID диалога.
   * @returns Последнее сообщение.
   */
  @Security("jwt")
  @Get("/message/last-message")
  getLastMessage(
    @Query("dialogId") dialogId: string,
  ): Promise<IDialogMessagesDto[]> {
    return this._dialogMessagesService.getLastMessage(dialogId);
  }

  /**
   * Получает сообщение по ID.
   *
   * @summary Получение сообщения по ID
   * @param id ID сообщения.
   * @returns Сообщение.
   */
  @Security("jwt")
  @Get("/message/{id}")
  getMessageById(@Path() id: string): Promise<IDialogMessagesDto> {
    return this._dialogMessagesService.getMessageById(id);
  }

  /**
   * Отправляет новое сообщение в диалог.
   *
   * @summary Отправка сообщения
   * @param req Запрос с JWT-токеном.
   * @param message Данные сообщения.
   * @returns Созданное сообщение.
   */
  @Security("jwt")
  @Post("/message/")
  newMessage(
    @Body() message: IMessagesRequest,
    @Request() req: KoaRequest,
  ): Promise<IDialogMessagesDto> {
    const user = getContextUser(req);

    return this._dialogMessagesService.appendMessage(user.id, message);
  }

  /**
   * Обновляет существующее сообщение в диалоге.
   *
   * @summary Обновление сообщения
   * @param id ID сообщения, которое нужно обновить.
   * @param req Запрос с JWT-токеном.
   * @param body Данные для обновления сообщения.
   * @returns Обновлённое сообщение.
   *
   * Этот метод позволяет пользователю обновить сообщение в диалоге.
   * Только автор сообщения может его обновить.
   * Метод принимает ID сообщения, данные для обновления и текущий JWT-токен, чтобы удостовериться,
   * что запрос исходит от пользователя, который имеет право на изменения.
   * После успешного обновления, возвращается обновлённое сообщение.
   */
  @Security("jwt")
  @Patch("/message/{id}")
  updateMessage(
    id: string,
    @Request() req: KoaRequest,
    @Body() body: IMessagesUpdateRequest,
  ): Promise<IDialogMessagesDto> {
    const user = getContextUser(req);

    return this._dialogMessagesService.updateMessage(id, user.id, body);
  }

  /**
   * Удаляет сообщение из диалога.
   *
   * @summary Удаление сообщения
   * @param id ID сообщения, которое нужно удалить.
   * @param req Запрос с JWT-токеном.
   * @returns Статус выполнения операции.
   *
   * Этот метод позволяет пользователю удалить сообщение из диалога.
   * Удаление доступно только для пользователя, который является автором сообщения.
   * Метод принимает ID сообщения, которое необходимо удалить, и текущий JWT-токен для аутентификации.
   * После успешного удаления сообщения возвращается статус выполнения операции.
   */
  @Security("jwt")
  @Delete("/message/{id}")
  deleteMessage(id: string, @Request() req: KoaRequest): Promise<void> {
    const user = getContextUser(req);

    return this._dialogMessagesService.deleteMessage(id, user.id);
  }
}
