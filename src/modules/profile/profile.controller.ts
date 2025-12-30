import { inject, injectable } from "inversify";
import {
  Body,
  Controller,
  Delete,
  File,
  Get,
  Patch,
  Post,
  Query,
  Request,
  Route,
  Security,
  Tags,
  UploadedFile,
} from "tsoa";

import { getContextUser } from "../../common";
import { Injectable } from "../../decorators/injectable.decorator";
import { KoaRequest } from "../../types/koa";
import {
  IProfileDto,
  IProfileListDto,
  IProfileUpdateRequest,
} from "./profile.model";
import { ProfileService } from "./profile.service";

@Injectable()
@Tags("Profile")
@Route("api/profile")
export class ProfileController extends Controller {
  constructor(@inject(ProfileService) private _profileService: ProfileService) {
    super();
  }

  /**
   * Получить профиль текущего пользователя.
   * Этот эндпоинт позволяет получить данные профиля пользователя, который выполнил запрос.
   * Используется для получения информации о текущем пользователе, например, его имени, email, и других данных.
   *
   * @summary Получение профиля текущего пользователя
   * @returns Пользователь
   */
  @Security("jwt")
  @Get("my")
  getMyProfile(@Request() req: KoaRequest): Promise<IProfileDto> {
    const user = getContextUser(req);

    return this._profileService.getProfileByUserId(user.id);
  }

  /**
   * Обновить профиль текущего пользователя.
   * Этот эндпоинт позволяет пользователю обновить свои данные, такие как имя, email и другие параметры профиля.
   *
   * @summary Обновление профиля текущего пользователя
   * @param body Обновленные данные профиля
   * @returns Обновленный профиль пользователя
   */
  @Security("jwt")
  @Patch("/my/update")
  updateMyProfile(
    @Request() req: KoaRequest,
    @Body() body: IProfileUpdateRequest,
  ): Promise<IProfileDto> {
    const user = getContextUser(req);

    return this._profileService.updateProfile(user.id, body);
  }

  /**
   * Удалить профиль текущего пользователя.
   * Этот эндпоинт позволяет пользователю удалить свой профиль из системы.
   *
   * @summary Удаление профиля текущего пользователя
   * @returns Сообщение об успешном удалении
   */
  @Security("jwt")
  @Delete("my/delete")
  deleteMyProfile(@Request() req: KoaRequest): Promise<string> {
    const user = getContextUser(req);

    return this._profileService.deleteProfile(user.id);
  }

  /**
   * Получить все профили.
   * Этот эндпоинт позволяет администраторам получить список всех пользователей системы.
   * Он поддерживает пагинацию через параметры `offset` и `limit`.
   *
   * @summary Получение всех профилей
   * @param offset Смещение для пагинации
   * @param limit Лимит количества возвращаемых профилей
   * @returns Список всех профилей с информацией о них
   */
  @Security("jwt")
  @Get("all")
  async getProfiles(
    @Query("offset") offset?: number,
    @Query("limit") limit?: number,
  ): Promise<IProfileListDto> {
    const result = await this._profileService.getProfiles(offset, limit);

    return {
      offset,
      limit,
      count: result.length,
      data: result,
    };
  }

  /**
   * Получить профиль по ID.
   * Этот эндпоинт позволяет получить профиль другого пользователя по его ID. Доступен только для администраторов.
   *
   * @summary Получение профиля по ID
   * @param userId ID пользователя, профиль которого нужно получить
   * @returns Пользователь по ID
   */
  @Security("jwt")
  @Get("/{userId}")
  getProfileById(userId: string): Promise<IProfileDto> {
    return this._profileService.getProfileByUserId(userId);
  }

  /**
   * Обновить профиль другого пользователя.
   * Этот эндпоинт позволяет администраторам обновлять профиль других пользователей.
   *
   * @summary Обновление профиля другого пользователя
   * @param userId ID пользователя, профиль которого необходимо обновить
   * @param body Данные для обновления профиля
   * @returns Обновленный профиль пользователя
   */
  @Security("jwt", ["role:admin"])
  @Patch("update/{userId}")
  updateProfile(
    userId: string,
    @Body() body: IProfileUpdateRequest,
  ): Promise<IProfileDto> {
    return this._profileService.updateProfile(userId, body);
  }

  /**
   * Загрузить аватар для текущего пользователя.
   * Этот эндпоинт позволяет пользователю загрузить аватар для своего профиля.
   *
   * @summary Загрузка аватара
   * @param file Файл изображения аватара
   * @returns Обновленный профиль с новым аватаром
   */
  @Security("jwt")
  @Post("/avatar/upload")
  addAvatar(
    @Request() req: KoaRequest,
    @UploadedFile() file: File,
  ): Promise<IProfileDto> {
    const user = getContextUser(req);

    return this._profileService.addAvatar(user.id, file);
  }

  /**
   * Удалить аватар пользователя.
   * Этот эндпоинт позволяет пользователю удалить свой аватар.
   *
   * @summary Удаление аватара
   * @param id ID аватара, который необходимо удалить
   * @returns Обновленный профиль без аватара
   */
  @Security("jwt")
  @Delete("/avatar")
  removeAvatar(@Request() req: KoaRequest): Promise<IProfileDto> {
    const user = getContextUser(req);

    return this._profileService.removeAvatar(user.id);
  }

  /**
   * Удалить профиль другого пользователя.
   * Этот эндпоинт позволяет администраторам удалить профиль другого пользователя из системы.
   *
   * @summary Удаление профиля другого пользователя
   * @param userId ID пользователя, профиль которого необходимо удалить
   * @returns Сообщение об успешном удалении
   */
  @Security("jwt", ["role:admin"])
  @Delete("delete/{userId}")
  deleteProfile(userId: string): Promise<string> {
    return this._profileService.deleteProfile(userId);
  }
}
