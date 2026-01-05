import { inject } from "inversify";
import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";

import {
  getContextUser,
  IApiResponseDto,
  Injectable,
  ValidateBody,
} from "../../core";
import { KoaRequest } from "../../types/koa";
import {
  IUserChangePasswordDto,
  IUserDto,
  IUserListDto,
  IUserPrivilegesRequestDto,
  IUserUpdateRequestDto,
} from "./user.dto";
import { UserService } from "./user.service";
import { UserUpdateSchema } from "./user.validate";

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
  // @UseGuards(AuthGuard)
  @Security("jwt")
  @Get("my")
  getMyUser(@Request() req: KoaRequest): Promise<IUserDto> {
    const user = getContextUser(req);

    return this._userService.getUser(user.id);
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
  ): Promise<IUserDto> {
    const user = getContextUser(req);

    return this._userService.updateUser(user.id, body);
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
  deleteMyUser(@Request() req: KoaRequest): Promise<string> {
    const user = getContextUser(req);

    return this._userService.deleteUser(user.id);
  }

  /**
   * Получить всех пользователей.
   * Этот эндпоинт позволяет администраторам получить список всех пользователей системы.
   * Он поддерживает пагинацию через параметры `offset` и `limit`.
   *
   * @summary Получение всех пользователей
   * @param offset Смещение для пагинации
   * @param limit Лимит количества возвращаемых пользователей
   * @returns Список всех пользователей с информацией о них
   */
  @Security("jwt", ["role:admin"])
  @Get("all")
  getUsers(
    @Query("offset") offset?: number,
    @Query("limit") limit?: number,
  ): Promise<IUserListDto> {
    return this._userService.getUsers(offset, limit).then(result => ({
      offset,
      limit,
      count: result.length,
      data: result,
    }));
  }

  /**
   * Получить пользователя по ID.
   * Этот эндпоинт позволяет получить пользователя по его ID. Доступен только для администраторов.
   *
   * @summary Получение пользователя по ID
   * @param id ID пользователя, которого нужно получить
   * @returns Пользователь по ID
   */
  @Security("jwt", ["role:admin"])
  @Get("/{id}")
  getUserById(id: string): Promise<IUserDto> {
    return this._userService.getUser(id);
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
  @Security("jwt", ["role:admin"])
  @Patch("setPrivileges/{id}")
  setPrivileges(
    id: string,
    @Body() body: IUserPrivilegesRequestDto,
  ): Promise<IUserDto> {
    return this._userService.setPrivileges(id, body.roleName, body.permissions);
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

    return this._userService.requestVerifyEmail(user.id, user.email);
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
  ): Promise<IApiResponseDto> {
    const user = getContextUser(req);

    return this._userService.verifyEmail(user.id, code);
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
  @Security("jwt", ["role:admin"])
  @Patch("update/{id}")
  updateUser(
    id: string,
    @Body() body: IUserUpdateRequestDto,
  ): Promise<IUserDto> {
    return this._userService.updateUser(id, body);
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
  changePassword(
    @Request() req: KoaRequest,
    @Body() body: IUserChangePasswordDto,
  ): Promise<IApiResponseDto> {
    const user = getContextUser(req);

    return this._userService.changePassword(user.id, body.password);
  }

  /**
   * Удалить другого пользователя.
   * Этот эндпоинт позволяет администраторам удалить другого пользователя из системы.
   *
   * @summary Удаление другого пользователя
   * @param id ID пользователя, которого необходимо удалить
   * @returns Сообщение об успешном удалении
   */
  @Security("jwt", ["role:admin"])
  @Delete("delete/{id}")
  deleteUser(id: string): Promise<string> {
    return this._userService.deleteUser(id);
  }
}
