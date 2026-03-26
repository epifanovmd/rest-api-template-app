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

import {
  ApiResponseDto,
  getContextUser,
  Injectable,
  ValidateBody,
} from "../../core";
import { KoaRequest } from "../../types/koa";
import {
  IUserChangePasswordDto,
  IUserListDto,
  IUserOptionDto,
  IUserOptionsDto,
  IUserPrivilegesRequestDto,
  IUserUpdateRequestDto,
  PublicUserDto,
  UserDto,
} from "./dto";
import { UserService } from "./user.service";
import {
  ChangePasswordSchema,
  SetPrivilegesSchema,
  SetUsernameSchema,
  UserUpdateSchema,
} from "./validation";

@Injectable()
@Tags("User")
@Route("api/user")
export class UserController extends Controller {
  constructor(@inject(UserService) private _userService: UserService) {
    super();
  }

  /**
   * Получить пользователя.
   * Этот эндпоинт позволяет получить данные пользователя, который выполнил запрос.
   *
   * @summary Получение данных текущего пользователя
   * @returns Пользователь
   */
  @Security("jwt")
  @Get("my")
  getMyUser(@Request() req: KoaRequest): Promise<UserDto> {
    const user = getContextUser(req);

    return this._userService.getUser(user.userId).then(UserDto.fromEntity);
  }

  /**
   * Обновить пользователя.
   * Этот эндпоинт позволяет пользователю обновить свои данные, такие как email, телефон и другие параметры пользователя.
   *
   * @summary Обновление данных текущего пользователя
   * @param req
   * @param body Обновленные данные пользователя
   * @returns Обновленный пользователя
   */
  @Security("jwt")
  @Patch("/my/update")
  @ValidateBody(UserUpdateSchema)
  updateMyUser(
    @Request() req: KoaRequest,
    @Body() body: IUserUpdateRequestDto,
  ): Promise<UserDto> {
    const user = getContextUser(req);

    return this._userService
      .updateUser(user.userId, body)
      .then(UserDto.fromEntity);
  }

  /**
   * Удалить текущего пользователя.
   * Этот эндпоинт позволяет удалить пользователя из системы.
   *
   * @summary Удаление текущего пользователя
   * @returns Сообщение об успешном удалении
   */
  @Security("jwt")
  @Delete("my/delete")
  deleteMyUser(@Request() req: KoaRequest): Promise<boolean> {
    const user = getContextUser(req);

    return this._userService.deleteUser(user.userId);
  }

  /**
   * Установить username для текущего пользователя.
   * @summary Установка username
   */
  @Security("jwt")
  @ValidateBody(SetUsernameSchema)
  @Patch("my/username")
  setUsername(
    @Request() req: KoaRequest,
    @Body() body: { username: string },
  ): Promise<UserDto> {
    const user = getContextUser(req);

    return this._userService
      .setUsername(user.userId, body.username)
      .then(UserDto.fromEntity);
  }

  /**
   * Поиск пользователей по запросу (username, email, имя, фамилия).
   * @summary Поиск пользователей
   */
  @Security("jwt")
  @Get("search")
  async searchUsers(
    @Query() q: string,
    @Query() limit?: number,
    @Query() offset?: number,
  ): Promise<IUserListDto> {
    const [result, totalCount] = await this._userService.searchUsers(
      q,
      limit ?? 20,
      offset ?? 0,
    );

    return {
      offset,
      limit,
      count: result.length,
      totalCount,
      data: result.map(PublicUserDto.fromEntity),
    };
  }

  /**
   * Получить пользователя по username.
   * @summary Получение по username
   */
  @Security("jwt")
  @Get("by-username/{username}")
  getUserByUsername(@Path() username: string): Promise<PublicUserDto> {
    return this._userService
      .getUserByUsername(username)
      .then(PublicUserDto.fromEntity);
  }

  /**
   * Получить всех пользователей.
   * Поддерживает пагинацию и поиск по email.
   *
   * @summary Получение всех пользователей
   * @param offset Смещение для пагинации
   * @param limit Лимит количества возвращаемых пользователей
   * @param query Поиск по email
   * @returns Список всех пользователей
   */
  @Security("jwt", ["permission:user:view"])
  @Get("all")
  getUsers(
    @Query("offset") offset?: number,
    @Query("limit") limit?: number,
    @Query("query") query?: string,
  ): Promise<IUserListDto> {
    return this._userService.getUsers(offset, limit, query).then(([result, totalCount]) => ({
      offset,
      limit,
      count: result.length,
      totalCount,
      data: result.map(PublicUserDto.fromEntity),
    }));
  }

  /**
   * Получить опции пользователей для выпадающих списков (id + name).
   * name — имя и фамилия или email если профиль не заполнен.
   *
   * @summary Опции пользователей
   * @param query Поиск по email, имени или фамилии
   * @returns Список опций
   */
  @Security("jwt", ["permission:user:view"])
  @Get("options")
  getUserOptions(
    @Query("query") query?: string,
  ): Promise<IUserOptionsDto> {
    return this._userService.getOptions(query).then(data => ({ data }));
  }

  /**
   * Получить пользователя по ID.
   * Этот эндпоинт позволяет получить пользователя по его ID. Доступен только для администраторов.
   *
   * @summary Получение пользователя по ID
   * @param id ID пользователя, которого нужно получить
   * @returns Пользователь по ID
   */
  @Security("jwt", ["permission:user:view"])
  @Get("/{id}")
  getUserById(id: string): Promise<UserDto> {
    return this._userService.getUser(id).then(UserDto.fromEntity);
  }

  /**
   * Установить привилегии для пользователя.
   * Этот эндпоинт позволяет администраторам устанавливать роль и права пользователя.
   *
   * @summary Установка привилегий для пользователя
   * @param id ID пользователя, для которого необходимо установить привилегии
   * @param body Запрос, содержащий роль и разрешения
   * @returns Обновленный пользователь с привилегиями
   */
  @Security("jwt", ["permission:user:manage"])
  @Patch("setPrivileges/{id}")
  @ValidateBody(SetPrivilegesSchema)
  setPrivileges(
    id: string,
    @Body() body: IUserPrivilegesRequestDto,
  ): Promise<UserDto> {
    return this._userService.setPrivileges(id, body).then(UserDto.fromEntity);
  }

  /**
   * Запросить подтверждение email-адреса для текущего пользователя.
   * Этот эндпоинт позволяет отправить пользователю письмо для подтверждения его email-адреса.
   *
   * @summary Запрос подтверждения email
   * @returns Ответ о том, что запрос на подтверждение был успешно отправлен
   */
  @Security("jwt")
  @Post("requestVerifyEmail")
  requestVerifyEmail(@Request() req: KoaRequest): Promise<boolean> {
    const user = getContextUser(req);

    return this._userService.requestVerifyEmail(user.userId);
  }

  /**
   * Подтвердить email-адрес текущего пользователя по коду.
   * Этот эндпоинт позволяет пользователю подтвердить свой email, используя код, полученный в письме.
   *
   * @summary Подтверждение email-адреса
   * @param code Код подтверждения email, полученный пользователем
   * @param req
   * @returns Ответ о статусе подтверждения
   */
  @Security("jwt")
  @Get("verifyEmail/{code}")
  verifyEmail(
    code: string,
    @Request() req: KoaRequest,
  ): Promise<ApiResponseDto> {
    const user = getContextUser(req);

    return this._userService.verifyEmail(user.userId, code);
  }

  /**
   * Обновить пользователя.
   * Этот эндпоинт позволяет администраторам обновлять других пользователей.
   *
   * @summary Обновление другого пользователя
   * @param id ID пользователя, которого необходимо обновить
   * @param body Данные для обновления пользователя
   * @returns Обновленный пользователь
   */
  @Security("jwt", ["permission:user:manage"])
  @Patch("update/{id}")
  @ValidateBody(UserUpdateSchema)
  updateUser(
    id: string,
    @Body() body: IUserUpdateRequestDto,
  ): Promise<UserDto> {
    return this._userService.updateUser(id, body).then(UserDto.fromEntity);
  }

  /**
   * Изменить пароль текущего пользователя.
   * Этот эндпоинт позволяет пользователю изменить свой пароль.
   *
   * @summary Изменение пароля
   * @param req
   * @param body Новый пароль для пользователя
   * @returns Ответ о статусе изменения пароля
   */
  @Security("jwt")
  @Post("changePassword")
  @ValidateBody(ChangePasswordSchema)
  changePassword(
    @Request() req: KoaRequest,
    @Body() body: IUserChangePasswordDto,
  ): Promise<ApiResponseDto> {
    const user = getContextUser(req);

    return this._userService.changePassword(user.userId, body.password);
  }

  /**
   * Удалить другого пользователя.
   * Этот эндпоинт позволяет администраторам удалить другого пользователя из системы.
   *
   * @summary Удаление другого пользователя
   * @param id ID пользователя, которого необходимо удалить
   * @returns Сообщение об успешном удалении
   */
  @Security("jwt", ["permission:user:manage"])
  @Delete("delete/{id}")
  deleteUser(id: string): Promise<boolean> {
    return this._userService.deleteUser(id);
  }
}
