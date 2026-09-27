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
import { getContextUser, Injectable, ValidateBody } from "../../core";
import { UUID } from "../../core/http";
import { KoaRequest } from "../../types/koa";
import { ChatService } from "./chat.service";
import {
  ChatDto,
  ChatFolderDto,
  ChatInviteDto,
  ChatMemberDto,
  ChatMemberPublicDto,
} from "./dto";
import {
  IAddMembersBody,
  ICreateChannelBody,
  ICreateDirectChatBody,
  ICreateFolderBody,
  ICreateGroupChatBody,
  ICreateInviteBody,
  IMoveChatToFolderBody,
  IMuteChatBody,
  ITransferOwnershipBody,
  IUpdateChannelBody,
  IUpdateChatBody,
  IUpdateFolderBody,
  IUpdateMemberRoleBody,
} from "./dto/chat-request.dto";
import {
  AddMembersSchema,
  CreateChannelSchema,
  CreateDirectChatSchema,
  CreateFolderSchema,
  CreateGroupChatSchema,
  CreateInviteSchema,
  MoveChatToFolderSchema,
  MuteChatSchema,
  TransferOwnershipSchema,
  UpdateChannelSchema,
  UpdateChatSchema,
  UpdateFolderSchema,
  UpdateMemberRoleSchema,
} from "./validation";

@Injectable()
@Tags("Chat")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/chat")
export class ChatController extends Controller {
  constructor(@inject(ChatService) private _chatService: ChatService) {
    super();
  }

  /**
   * Создать или получить существующий личный чат.
   * @summary Создание личного чата
   */
  @Security("jwt")
  @ValidateBody(CreateDirectChatSchema)
  @SuccessResponse(201, "Created")
  @Post("direct")
  createDirectChat(
    @Request() req: KoaRequest,
    @Body() body: ICreateDirectChatBody,
  ): Promise<ChatDto> {
    const user = getContextUser(req);

    return this._chatService.createDirectChat(user.userId, body.targetUserId);
  }

  /**
   * Создать групповой чат.
   * @summary Создание группового чата
   */
  @Security("jwt")
  @ValidateBody(CreateGroupChatSchema)
  @SuccessResponse(201, "Created")
  @Post("group")
  createGroupChat(
    @Request() req: KoaRequest,
    @Body() body: ICreateGroupChatBody,
  ): Promise<ChatDto> {
    const user = getContextUser(req);

    return this._chatService.createGroupChat(
      user.userId,
      body.name,
      body.memberIds,
      body.avatarId,
    );
  }

  /**
   * Создать канал.
   * @summary Создание канала
   */
  @Security("jwt")
  @ValidateBody(CreateChannelSchema)
  @SuccessResponse(201, "Created")
  @Post("channel")
  createChannel(
    @Request() req: KoaRequest,
    @Body() body: ICreateChannelBody,
  ): Promise<ChatDto> {
    const user = getContextUser(req);

    return this._chatService.createChannel(user.userId, body);
  }

  /**
   * Обновить канал.
   * @summary Обновление канала
   */
  @Security("jwt")
  @ValidateBody(UpdateChannelSchema)
  @Patch("channel/{id}")
  updateChannel(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: IUpdateChannelBody,
  ): Promise<ChatDto> {
    const user = getContextUser(req);

    return this._chatService.updateChannel(id, user.userId, body);
  }

  /**
   * Подписаться на публичный канал.
   * @summary Подписка на канал
   */
  @Security("jwt")
  @Post("channel/{id}/subscribe")
  subscribeToChannel(
    @Request() req: KoaRequest,
    @Path() id: UUID,
  ): Promise<ChatDto> {
    const user = getContextUser(req);

    return this._chatService.subscribeToChannel(id, user.userId);
  }

  /**
   * Отписаться от канала.
   * @summary Отписка от канала
   */
  @Security("jwt")
  @SuccessResponse(204, "No Content")
  @Delete("channel/{id}/subscribe")
  async unsubscribeFromChannel(
    @Request() req: KoaRequest,
    @Path() id: UUID,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._chatService.unsubscribeFromChannel(id, user.userId);
  }

  /**
   * Поиск публичных каналов. Запрос `q` — минимум 2 символа.
   * @summary Поиск каналов
   * @param offset Смещение (по умолчанию 0)
   * @param limit Размер страницы (по умолчанию 20, максимум 100)
   */
  @Security("jwt")
  @Get("channel/search")
  searchChannels(
    @Query() q?: string,
    @Query() offset?: number,
    @Query() limit?: number,
  ): Promise<IPaginatedDto<ChatDto>> {
    return this._chatService.getPublicChannels(q, offset, limit);
  }

  /**
   * Список чатов текущего пользователя. Для каждого чата — своё членство
   * (`me`), `membersCount` и первые участники; скрытые direct-чаты не входят.
   * @summary Список чатов
   * @param offset Смещение (по умолчанию 0)
   * @param limit Размер страницы (по умолчанию 20, максимум 100)
   */
  @Security("jwt")
  @Get()
  getUserChats(
    @Request() req: KoaRequest,
    @Query() offset?: number,
    @Query() limit?: number,
  ): Promise<IPaginatedDto<ChatDto>> {
    const user = getContextUser(req);

    return this._chatService.getUserChats(user.userId, offset, limit);
  }

  /**
   * Получить информацию о чате.
   * @summary Получение чата
   */
  @Security("jwt")
  @Get("{id}")
  getChatById(@Request() req: KoaRequest, @Path() id: UUID): Promise<ChatDto> {
    const user = getContextUser(req);

    return this._chatService.getChatById(id, user.userId);
  }

  /**
   * Обновить групповой чат (название, аватар).
   * @summary Обновление чата
   */
  @Security("jwt")
  @ValidateBody(UpdateChatSchema)
  @Patch("{id}")
  updateChat(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: IUpdateChatBody,
  ): Promise<ChatDto> {
    const user = getContextUser(req);

    return this._chatService.updateChat(id, user.userId, body);
  }

  /**
   * Покинуть чат. Личный чат скрывается до нового сообщения. Владелец
   * группы/канала должен сначала передать права (409), если он не последний
   * участник; последний участник-владелец удаляет чат.
   * @summary Выход из чата
   */
  @Security("jwt")
  @SuccessResponse(204, "No Content")
  @Post("{id}/leave")
  async leaveChat(@Request() req: KoaRequest, @Path() id: UUID): Promise<void> {
    const user = getContextUser(req);

    await this._chatService.leaveChat(id, user.userId);
  }

  /**
   * Удалить группу или канал. Только владелец.
   * @summary Удаление чата
   */
  @Security("jwt")
  @SuccessResponse(204, "No Content")
  @Delete("{id}")
  async deleteChat(
    @Request() req: KoaRequest,
    @Path() id: UUID,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._chatService.deleteChat(id, user.userId);
  }

  /**
   * Передать права владельца другому участнику. Текущий владелец становится
   * администратором.
   * @summary Передача владения
   */
  @Security("jwt")
  @ValidateBody(TransferOwnershipSchema)
  @SuccessResponse(204, "No Content")
  @Post("{id}/transfer-ownership")
  async transferOwnership(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: ITransferOwnershipBody,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._chatService.transferOwnership(id, user.userId, body.userId);
  }

  /**
   * Участники чата постранично (без приватных настроек).
   * @summary Участники чата
   * @param offset Смещение (по умолчанию 0)
   * @param limit Размер страницы (по умолчанию 20, максимум 100)
   */
  @Security("jwt")
  @Get("{id}/members")
  getChatMembers(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Query() offset?: number,
    @Query() limit?: number,
  ): Promise<IPaginatedDto<ChatMemberPublicDto>> {
    const user = getContextUser(req);

    return this._chatService.getChatMembers(id, user.userId, offset, limit);
  }

  /**
   * Создать invite-ссылку для группового чата.
   * @summary Создание invite-ссылки
   */
  @Security("jwt")
  @ValidateBody(CreateInviteSchema)
  @SuccessResponse(201, "Created")
  @Post("{id}/invite")
  createInviteLink(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: ICreateInviteBody,
  ): Promise<ChatInviteDto> {
    const user = getContextUser(req);

    return this._chatService.createInviteLink(id, user.userId, body);
  }

  /**
   * Активные invite-ссылки чата постранично. Только ADMIN/OWNER.
   * @summary Список invite-ссылок
   * @param offset Смещение (по умолчанию 0)
   * @param limit Размер страницы (по умолчанию 20, максимум 100)
   */
  @Security("jwt")
  @Get("{id}/invite")
  getInvites(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Query() offset?: number,
    @Query() limit?: number,
  ): Promise<IPaginatedDto<ChatInviteDto>> {
    const user = getContextUser(req);

    return this._chatService.getInvites(id, user.userId, offset, limit);
  }

  /**
   * Отозвать invite-ссылку.
   * @summary Отзыв invite-ссылки
   */
  @Security("jwt")
  @SuccessResponse(204, "No Content")
  @Delete("{id}/invite/{inviteId}")
  async revokeInvite(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Path() inviteId: UUID,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._chatService.revokeInvite(id, inviteId, user.userId);
  }

  /**
   * Присоединиться к чату по invite-коду.
   * @summary Вступление по invite-ссылке
   */
  @Security("jwt")
  @Post("join/{code}")
  joinByInvite(
    @Request() req: KoaRequest,
    @Path() code: string,
  ): Promise<ChatDto> {
    const user = getContextUser(req);

    return this._chatService.joinByInvite(code, user.userId);
  }

  /**
   * Замутить или размутить чат.
   * @summary Мут чата
   */
  @Security("jwt")
  @ValidateBody(MuteChatSchema)
  @Patch("{id}/mute")
  async muteChat(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: IMuteChatBody,
  ): Promise<ChatMemberDto> {
    const user = getContextUser(req);
    const member = await this._chatService.muteChat(
      id,
      user.userId,
      body.mutedUntil ? new Date(body.mutedUntil) : null,
    );

    return this._chatService.toMemberDto(member);
  }

  /**
   * Добавить участников в групповой чат. Возвращает только добавленных
   * (уже состоявшие пропускаются).
   * @summary Добавление участников
   */
  @Security("jwt")
  @ValidateBody(AddMembersSchema)
  @Post("{id}/members")
  async addMembers(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: IAddMembersBody,
  ): Promise<ChatMemberPublicDto[]> {
    const user = getContextUser(req);
    const members = await this._chatService.addMembers(
      id,
      user.userId,
      body.memberIds,
    );

    return this._chatService.toMemberPublicDtos(members);
  }

  /**
   * Удалить участника группы или канала. Владелец — любого, администратор —
   * только участников и подписчиков.
   * @summary Удаление участника
   */
  @Security("jwt")
  @SuccessResponse(204, "No Content")
  @Delete("{id}/members/{userId}")
  async removeMember(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Path() userId: UUID,
  ): Promise<void> {
    const currentUser = getContextUser(req);

    await this._chatService.removeMember(id, currentUser.userId, userId);
  }

  /**
   * Изменить роль участника. Только владелец; свою роль и роль владельца
   * менять нельзя. Группа: ADMIN/MEMBER, канал: ADMIN/SUBSCRIBER.
   * Владение передаётся отдельным методом.
   * @summary Изменение роли участника
   */
  @Security("jwt")
  @ValidateBody(UpdateMemberRoleSchema)
  @Patch("{id}/members/{userId}")
  async updateMemberRole(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Path() userId: UUID,
    @Body() body: IUpdateMemberRoleBody,
  ): Promise<ChatMemberPublicDto> {
    const currentUser = getContextUser(req);
    const member = await this._chatService.updateMemberRole(
      id,
      currentUser.userId,
      userId,
      body.role,
    );

    const [dto] = await this._chatService.toMemberPublicDtos([member]);

    return dto;
  }

  /**
   * Закрепить чат.
   * @summary Закрепление чата
   */
  @Security("jwt")
  @Post("{id}/pin")
  async pinChat(
    @Request() req: KoaRequest,
    @Path() id: UUID,
  ): Promise<ChatMemberDto> {
    const user = getContextUser(req);
    const member = await this._chatService.pinChat(id, user.userId);

    return this._chatService.toMemberDto(member);
  }

  /**
   * Открепить чат.
   * @summary Открепление чата
   */
  @Security("jwt")
  @Delete("{id}/pin")
  async unpinChat(
    @Request() req: KoaRequest,
    @Path() id: UUID,
  ): Promise<ChatMemberDto> {
    const user = getContextUser(req);
    const member = await this._chatService.unpinChat(id, user.userId);

    return this._chatService.toMemberDto(member);
  }

  /**
   * Переместить чат в папку.
   * @summary Перемещение в папку
   */
  @Security("jwt")
  @ValidateBody(MoveChatToFolderSchema)
  @Patch("{id}/folder")
  async moveChatToFolder(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: IMoveChatToFolderBody,
  ): Promise<ChatMemberDto> {
    const user = getContextUser(req);
    const member = await this._chatService.moveChatToFolder(
      id,
      user.userId,
      body.folderId,
    );

    return this._chatService.toMemberDto(member);
  }

  /**
   * Папки чатов пользователя — целиком (не больше 20).
   * @summary Список папок
   */
  @Security("jwt")
  @Get("folder/list")
  getUserFolders(@Request() req: KoaRequest): Promise<ChatFolderDto[]> {
    const user = getContextUser(req);

    return this._chatService.getUserFolders(user.userId);
  }

  /**
   * Создать папку для чатов.
   * @summary Создание папки
   */
  @Security("jwt")
  @ValidateBody(CreateFolderSchema)
  @SuccessResponse(201, "Created")
  @Post("folder")
  createFolder(
    @Request() req: KoaRequest,
    @Body() body: ICreateFolderBody,
  ): Promise<ChatFolderDto> {
    const user = getContextUser(req);

    return this._chatService.createFolder(user.userId, body.name);
  }

  /**
   * Обновить папку.
   * @summary Обновление папки
   */
  @Security("jwt")
  @ValidateBody(UpdateFolderSchema)
  @Patch("folder/{folderId}")
  updateFolder(
    @Request() req: KoaRequest,
    @Path() folderId: UUID,
    @Body() body: IUpdateFolderBody,
  ): Promise<ChatFolderDto> {
    const user = getContextUser(req);

    return this._chatService.updateFolder(user.userId, folderId, body);
  }

  /**
   * Удалить папку.
   * @summary Удаление папки
   */
  @Security("jwt")
  @SuccessResponse(204, "No Content")
  @Delete("folder/{folderId}")
  async deleteFolder(
    @Request() req: KoaRequest,
    @Path() folderId: UUID,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._chatService.deleteFolder(user.userId, folderId);
  }
}
