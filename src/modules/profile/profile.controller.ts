import { inject } from "inversify";
import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Path,
  Query,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";

import { getContextUser, Injectable, ValidateBody } from "../../core";
import { KoaRequest } from "../../types/koa";
import {
  IProfileListDto,
  IProfileUpdateRequestDto,
  PrivacySettingsDto,
  ProfileDto,
  PublicProfileDto,
} from "./dto";
import { EPrivacyLevel } from "./privacy-settings.entity";
import { PrivacySettingsService } from "./privacy-settings.service";
import { ProfileService } from "./profile.service";
import { UpdatePrivacySchema } from "./validation";

@Injectable()
@Tags("Profile")
@Route("api/profile")
export class ProfileController extends Controller {
  constructor(
    @inject(ProfileService) private _profileService: ProfileService,
    @inject(PrivacySettingsService)
    private _privacyService: PrivacySettingsService,
  ) {
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
  async getMyProfile(@Request() req: KoaRequest): Promise<ProfileDto> {
    const user = getContextUser(req);
    const profile = await this._profileService.getProfileByUserId(user.userId);

    return ProfileDto.fromEntity(profile);
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
  async updateMyProfile(
    @Request() req: KoaRequest,
    @Body() body: IProfileUpdateRequestDto,
  ): Promise<ProfileDto> {
    const user = getContextUser(req);
    const profile = await this._profileService.updateProfile(user.userId, body);

    return ProfileDto.fromEntity(profile);
  }

  /**
   * Получить настройки приватности.
   * @summary Настройки приватности
   */
  @Security("jwt")
  @Get("my/privacy")
  async getPrivacySettings(
    @Request() req: KoaRequest,
  ): Promise<PrivacySettingsDto> {
    const user = getContextUser(req);
    const settings = await this._privacyService.getSettings(user.userId);

    return PrivacySettingsDto.fromEntity(settings);
  }

  /**
   * Обновить настройки приватности.
   * @summary Обновление настроек приватности
   */
  @Security("jwt")
  @ValidateBody(UpdatePrivacySchema)
  @Patch("my/privacy")
  async updatePrivacySettings(
    @Request() req: KoaRequest,
    @Body()
    body: {
      showLastOnline?: EPrivacyLevel;
      showPhone?: EPrivacyLevel;
      showAvatar?: EPrivacyLevel;
    },
  ): Promise<PrivacySettingsDto> {
    const user = getContextUser(req);
    const settings = await this._privacyService.updateSettings(
      user.userId,
      body,
    );

    return PrivacySettingsDto.fromEntity(settings);
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

    return this._profileService.deleteProfile(user.userId);
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
  @Security("jwt", ["permission:profile:view"])
  @Get("all")
  async getProfiles(
    @Query("offset") offset?: number,
    @Query("limit") limit?: number,
  ): Promise<IProfileListDto> {
    const [result, totalCount] = await this._profileService.getProfiles(offset, limit);

    return {
      offset,
      limit,
      count: result.length,
      totalCount,
      data: result.map(PublicProfileDto.fromEntity),
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
  async getProfileById(@Path() userId: string): Promise<PublicProfileDto> {
    const profile = await this._profileService.getProfileByUserId(userId);

    return PublicProfileDto.fromEntity(profile);
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
  @Security("jwt", ["permission:profile:manage"])
  @Patch("update/{userId}")
  async updateProfile(
    @Path() userId: string,
    @Body() body: IProfileUpdateRequestDto,
  ): Promise<ProfileDto> {
    const profile = await this._profileService.updateProfile(userId, body);

    return ProfileDto.fromEntity(profile);
  }

  /**
   * Удалить профиль другого пользователя.
   * Этот эндпоинт позволяет администраторам удалить профиль другого пользователя из системы.
   *
   * @summary Удаление профиля другого пользователя
   * @param userId ID пользователя, профиль которого необходимо удалить
   * @returns Сообщение об успешном удалении
   */
  @Security("jwt", ["permission:profile:manage"])
  @Delete("delete/{userId}")
  deleteProfile(@Path() userId: string): Promise<string> {
    return this._profileService.deleteProfile(userId);
  }
}
