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
import { ChatService } from "./chat.service";
import { ChatFolderDto, ChatInviteDto, ChatMemberDto } from "./dto";
import { ChatDto, IChatListDto } from "./dto";
import {
  IAddMembersBody,
  ICreateChannelBody,
  ICreateDirectChatBody,
  ICreateFolderBody,
  ICreateGroupChatBody,
  ICreateInviteBody,
  IMoveChatToFolderBody,
  IMuteChatBody,
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
  UpdateChannelSchema,
  UpdateChatSchema,
  UpdateMemberRoleSchema,
} from "./validation";

@Injectable()
@Tags("Chat")
@Route("api/chat")
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
    @Path() id: string,
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
    @Path() id: string,
  ): Promise<ChatDto> {
    const user = getContextUser(req);

    return this._chatService.subscribeToChannel(id, user.userId);
  }

  /**
   * Отписаться от канала.
   * @summary Отписка от канала
   */
  @Security("jwt")
  @Delete("channel/{id}/subscribe")
  unsubscribeFromChannel(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<string> {
    const user = getContextUser(req);

    return this._chatService.unsubscribeFromChannel(id, user.userId);
  }

  /**
   * Поиск публичных каналов.
   * @summary Поиск каналов
   */
  @Security("jwt")
  @Get("channel/search")
  async searchChannels(
    @Query() q?: string,
    @Query() offset?: number,
    @Query() limit?: number,
  ): Promise<IChatListDto> {
    const [chats, totalCount] = await this._chatService.getPublicChannels(
      q,
      offset,
      limit,
    );

    return {
      offset,
      limit,
      count: chats.length,
      totalCount,
      data: chats.map(ChatDto.fromEntity),
    };
  }

  /**
   * Получить список чатов текущего пользователя.
   * @summary Список чатов
   */
  @Security("jwt")
  @Get()
  async getUserChats(
    @Request() req: KoaRequest,
    @Query() offset?: number,
    @Query() limit?: number,
  ): Promise<IChatListDto> {
    const user = getContextUser(req);
    const [chats, totalCount] = await this._chatService.getUserChats(
      user.userId,
      offset,
      limit,
    );

    return {
      offset,
      limit,
      count: chats.length,
      totalCount,
      data: chats.map(ChatDto.fromEntity),
    };
  }

  /**
   * Получить информацию о чате.
   * @summary Получение чата
   */
  @Security("jwt")
  @Get("{id}")
  getChatById(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<ChatDto> {
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
    @Path() id: string,
    @Body() body: IUpdateChatBody,
  ): Promise<ChatDto> {
    const user = getContextUser(req);

    return this._chatService.updateChat(id, user.userId, body);
  }

  /**
   * Покинуть чат.
   * @summary Выход из чата
   */
  @Security("jwt")
  @Delete("{id}")
  leaveChat(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<string> {
    const user = getContextUser(req);

    return this._chatService.leaveChat(id, user.userId);
  }

  /**
   * Создать invite-ссылку для группового чата.
   * @summary Создание invite-ссылки
   */
  @Security("jwt")
  @ValidateBody(CreateInviteSchema)
  @Post("{id}/invite")
  createInviteLink(
    @Request() req: KoaRequest,
    @Path() id: string,
    @Body() body: ICreateInviteBody,
  ): Promise<ChatInviteDto> {
    const user = getContextUser(req);

    return this._chatService.createInviteLink(id, user.userId, body);
  }

  /**
   * Получить список invite-ссылок чата.
   * @summary Список invite-ссылок
   */
  @Security("jwt")
  @Get("{id}/invite")
  getInvites(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<ChatInviteDto[]> {
    const user = getContextUser(req);

    return this._chatService.getInvites(id, user.userId);
  }

  /**
   * Отозвать invite-ссылку.
   * @summary Отзыв invite-ссылки
   */
  @Security("jwt")
  @Delete("{id}/invite/{inviteId}")
  async revokeInvite(
    @Request() req: KoaRequest,
    @Path() id: string,
    @Path() inviteId: string,
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
    @Path() id: string,
    @Body() body: IMuteChatBody,
  ): Promise<ChatMemberDto> {
    const user = getContextUser(req);
    const member = await this._chatService.muteChat(
      id,
      user.userId,
      body.mutedUntil ? new Date(body.mutedUntil) : null,
    );

    return ChatMemberDto.fromEntity(member);
  }

  /**
   * Добавить участников в групповой чат.
   * @summary Добавление участников
   */
  @Security("jwt")
  @ValidateBody(AddMembersSchema)
  @Post("{id}/members")
  async addMembers(
    @Request() req: KoaRequest,
    @Path() id: string,
    @Body() body: IAddMembersBody,
  ): Promise<ChatMemberDto[]> {
    const user = getContextUser(req);
    const members = await this._chatService.addMembers(
      id,
      user.userId,
      body.memberIds,
    );

    return members.map(ChatMemberDto.fromEntity);
  }

  /**
   * Удалить участника из группового чата.
   * @summary Удаление участника
   */
  @Security("jwt")
  @Delete("{id}/members/{userId}")
  removeMember(
    @Request() req: KoaRequest,
    @Path() id: string,
    @Path() userId: string,
  ): Promise<string> {
    const currentUser = getContextUser(req);

    return this._chatService.removeMember(id, currentUser.userId, userId);
  }

  /**
   * Изменить роль участника в групповом чате.
   * @summary Изменение роли участника
   */
  @Security("jwt")
  @ValidateBody(UpdateMemberRoleSchema)
  @Patch("{id}/members/{userId}")
  async updateMemberRole(
    @Request() req: KoaRequest,
    @Path() id: string,
    @Path() userId: string,
    @Body() body: IUpdateMemberRoleBody,
  ): Promise<ChatMemberDto> {
    const currentUser = getContextUser(req);
    const member = await this._chatService.updateMemberRole(
      id,
      currentUser.userId,
      userId,
      body.role,
    );

    return ChatMemberDto.fromEntity(member);
  }

  /**
   * Закрепить чат.
   * @summary Закрепление чата
   */
  @Security("jwt")
  @Post("{id}/pin")
  async pinChat(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<ChatMemberDto> {
    const user = getContextUser(req);
    const member = await this._chatService.pinChat(id, user.userId);

    return ChatMemberDto.fromEntity(member);
  }

  /**
   * Открепить чат.
   * @summary Открепление чата
   */
  @Security("jwt")
  @Delete("{id}/pin")
  async unpinChat(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<ChatMemberDto> {
    const user = getContextUser(req);
    const member = await this._chatService.unpinChat(id, user.userId);

    return ChatMemberDto.fromEntity(member);
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
    @Path() id: string,
    @Body() body: IMoveChatToFolderBody,
  ): Promise<ChatMemberDto> {
    const user = getContextUser(req);
    const member = await this._chatService.moveChatToFolder(
      id,
      user.userId,
      body.folderId,
    );

    return ChatMemberDto.fromEntity(member);
  }

  /**
   * Получить список папок чатов.
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
  @Patch("folder/{folderId}")
  updateFolder(
    @Request() req: KoaRequest,
    @Path() folderId: string,
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
  @Delete("folder/{folderId}")
  async deleteFolder(
    @Request() req: KoaRequest,
    @Path() folderId: string,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._chatService.deleteFolder(user.userId, folderId);
  }
}
