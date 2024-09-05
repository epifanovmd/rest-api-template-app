import { injectable as Injectable } from "inversify/lib/annotation/injectable";
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
import { IProfileDto, TProfileRequest } from "./profile.model";
import { ProfileService } from "./profile.service";

const { getProfile, deleteProfile, getAllProfile, updateProfile } =
  new ProfileService();

@Injectable()
@Tags("Profile")
@Route("api/profile")
export class ProfileController extends Controller {
  @Security("jwt")
  @Get()
  getAllProfiles(
    @Query("offset") offset?: number,
    @Query("limit") limit?: number,
  ): Promise<ListResponse<IProfileDto[]>> {
    return getAllProfile(offset, limit).then(result => ({
      offset,
      limit,
      count: result.length,
      data: result,
    }));
  }

  @Security("jwt")
  @Get("{id}")
  getProfileById(id: string): Promise<IProfileDto> {
    return getProfile(id);
  }

  @Security("jwt")
  @Get("/my")
  getMyProfile(@Request() req: KoaRequest): Promise<IProfileDto> {
    const profileId = assertNotNull(
      req.ctx.request.user?.id,
      new ApiError("No token provided", 401),
    );

    return getProfile(profileId);
  }

  @Security("jwt")
  @Patch("/{id}")
  updateProfile(
    id: string,
    @Body() body: TProfileRequest,
  ): Promise<IProfileDto> {
    return updateProfile(id, body);
  }

  @Security("jwt")
  @Delete("/{id}")
  deleteProfile(id: number): Promise<number> {
    return deleteProfile(id);
  }
}
