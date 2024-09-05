import { inject, injectable } from "inversify";
import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Query,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";

import { ApiError, assertNotNull } from "../../common";
import { ListResponse } from "../../dto/ListResponse";
import { KoaRequest } from "../../types/koa";
import { IProfileDto, TProfileUpdateModel } from "./profile.model";
import { ProfileService } from "./profile.service";

@injectable()
@Tags("Profile")
@Route("api/profile")
export class ProfileController extends Controller {
  constructor(@inject(ProfileService) private _profileService: ProfileService) {
    super();
  }
  @Security("jwt")
  @Get()
  getAllProfiles(
    @Query("offset") offset?: number,
    @Query("limit") limit?: number,
  ): Promise<ListResponse<IProfileDto[]>> {
    return this._profileService.getAllProfile(offset, limit).then(result => ({
      offset,
      limit,
      count: result.length,
      data: result,
    }));
  }

  @Security("jwt")
  @Get("{id}")
  getProfileById(id: string): Promise<IProfileDto> {
    return this._profileService.getProfile(id);
  }

  @Security("jwt")
  @Get("/my")
  getMyProfile(@Request() req: KoaRequest): Promise<IProfileDto> {
    const profileId = assertNotNull(
      req.ctx.request.user?.id,
      new ApiError("No token provided", 401),
    );

    return this._profileService.getProfile(profileId);
  }

  @Security("jwt")
  @Patch("/{id}")
  updateProfile(
    id: string,
    @Body() body: TProfileUpdateModel,
  ): Promise<IProfileDto> {
    return this._profileService.updateProfile(id, body);
  }

  @Security("jwt")
  @Delete("/{id}")
  deleteProfile(id: number): Promise<number> {
    return this._profileService.deleteProfile(id);
  }
}
