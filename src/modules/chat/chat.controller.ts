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
import { EChatMemberRole } from "./chat.types";
import { ChatMemberDto } from "./dto";
import { ChatDto, IChatListDto } from "./dto";
import {
  AddMembersSchema,
  CreateDirectChatSchema,
  CreateGroupChatSchema,
  UpdateChatSchema,
  UpdateMemberRoleSchema,
} from "./validation";

interface ICreateDirectChatBody {
  targetUserId: string;
}

interface ICreateGroupChatBody {
  name: string;
  memberIds: string[];
  avatarId?: string;
}

interface IUpdateChatBody {
  name?: string;
  avatarId?: string | null;
}

interface IAddMembersBody {
  memberIds: string[];
}

interface IUpdateMemberRoleBody {
  role: EChatMemberRole;
}

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
}
