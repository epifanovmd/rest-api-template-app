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
import { v4 } from "uuid";

import { getContextProfile } from "../../common";
import { KoaRequest } from "../../types/koa";
import { EPermissions } from "../permission";
import { ERole } from "../role";
import {
  IProfileDto,
  IProfileListDto,
  IProfileUpdateRequest,
} from "./profile.model";
import { ProfileService } from "./profile.service";

@injectable()
@Tags("Profile")
@Route("api/profile")
export class ProfileController extends Controller {
  constructor(@inject(ProfileService) private _profileService: ProfileService) {
    super();
  }
  @Get("createTest")
  test(): Promise<IProfileDto> {
    return this._profileService
      .createProfile({
        username: "string",
        passwordHash: "124",
        email: "string@string.com",
        firstName: "",
        lastName: "",
        phone: "",
        id: v4(),
      })
      .then(res => {
        console.log("res", res);

        return this._profileService.setPrivilegesToUser(res.id, ERole.ADMIN, [
          EPermissions.WRITE,
          EPermissions.READ,
        ]);
      })
      .then(res => {
        return res;
      });
  }

  @Security("jwt", ["role:user", "permission:read"])
  @Get()
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

  // @Security("jwt")
  @Get("{id}")
  getProfileById(id: string): Promise<IProfileDto> {
    return this._profileService.getProfile(id);
  }

  @Security("jwt")
  @Get("/my")
  getMyProfile(@Request() req: KoaRequest): Promise<IProfileDto> {
    const profileId = getContextProfile(req);

    return this._profileService.getProfile(profileId);
  }

  @Security("jwt")
  @Patch("/{id}")
  updateProfile(
    id: string,
    @Body() body: IProfileUpdateRequest,
  ): Promise<IProfileDto> {
    return this._profileService.updateProfile(id, body);
  }

  @Security("jwt")
  @Delete("/{id}")
  deleteProfile(id: string): Promise<string> {
    return this._profileService.deleteProfile(id);
  }
}
