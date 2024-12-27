import { inject, injectable } from "inversify";
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

import { getContextProfile } from "../../common";
import { ApiResponse } from "../../dto/ApiResponse";
import { KoaRequest } from "../../types/koa";
import {
  IProfileDto,
  IProfileListDto,
  IProfilePrivilegesRequest,
  IProfileUpdateRequest,
} from "./profile.model";
import { ProfileService } from "./profile.service";
import { IProfilePassword } from "./profile.types";

@injectable()
@Tags("Profile")
@Route("api/profile")
export class ProfileController extends Controller {
  constructor(@inject(ProfileService) private _profileService: ProfileService) {
    super();
  }

  @Security("jwt")
  @Get("my")
  getMyProfile(@Request() req: KoaRequest): Promise<IProfileDto> {
    const profile = getContextProfile(req);

    return this._profileService.getProfile(profile.id);
  }

  @Security("jwt")
  @Patch("/my/update")
  updateMyProfile(
    @Request() req: KoaRequest,
    @Body() body: IProfileUpdateRequest,
  ): Promise<IProfileDto> {
    const profile = getContextProfile(req);

    return this._profileService.updateProfile(profile.id, body);
  }

  @Security("jwt")
  @Delete("my/delete")
  deleteMyProfile(@Request() req: KoaRequest): Promise<string> {
    const profile = getContextProfile(req);

    return this._profileService.deleteProfile(profile.id);
  }

  @Security("jwt")
  @Get("all")
  getAllProfiles(
    @Query("offset") offset?: number,
    @Query("limit") limit?: number,
  ): Promise<IProfileListDto> {
    return this._profileService.getAllProfile(offset, limit).then(result => ({
      offset,
      limit,
      count: result.length,
      data: result,
    }));
  }

  @Security("jwt")
  @Get("/{id}")
  getProfileById(id: string): Promise<IProfileDto> {
    return this._profileService.getProfile(id);
  }

  @Security("jwt", ["role:admin"])
  @Patch("setPrivileges/{id}")
  setPrivileges(
    id: string,
    @Body() body: IProfilePrivilegesRequest,
  ): Promise<IProfileDto> {
    return this._profileService.setPrivileges(
      id,
      body.roleName,
      body.permissions,
    );
  }

  @Security("jwt")
  @Post("requestVerifyEmail")
  requestVerifyEmail(@Request() req: KoaRequest): Promise<void> {
    const profile = getContextProfile(req);

    return this._profileService.requestVerifyEmail(profile.id, profile.email);
  }

  @Security("jwt")
  @Get("verifyEmail/{code}")
  verifyEmail(code: string, @Request() req: KoaRequest): Promise<ApiResponse> {
    const profile = getContextProfile(req);

    return this._profileService.verifyEmail(profile.id, code);
  }

  @Security("jwt", ["role:admin"])
  @Patch("update/{id}")
  updateProfile(
    id: string,
    @Body() body: IProfileUpdateRequest,
  ): Promise<IProfileDto> {
    return this._profileService.updateProfile(id, body);
  }

  @Security("jwt")
  @Post("changePassword")
  changePassword(
    @Request() req: KoaRequest,
    @Body() body: IProfilePassword,
  ): Promise<ApiResponse> {
    const profile = getContextProfile(req);

    return this._profileService.changePassword(profile.id, body.password);
  }

  @Security("jwt", ["role:admin"])
  @Delete("delete/{id}")
  deleteProfile(id: string): Promise<string> {
    return this._profileService.deleteProfile(id);
  }
}
