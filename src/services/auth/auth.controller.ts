import { inject as Inject, injectable as Injectable } from "inversify";
import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";
import { KoaRequest } from "../../types/koa";
import { AuthService } from "./auth.service";
import { AuthDto, CreateProfileDto, ProfileDto, Tokens } from "./auth.types";

const PHONE_REGEX = /^[\d+][\d() -]{4,14}\d$/;
const EMAIL_REGEX = /^(\S+)@([a-z0-9-]+)(\.)([a-z]{2,4})(\.?)([a-z]{0,4})+$/;

@Injectable()
@Tags("Authorization")
@Route("api/auth")
export class AuthController extends Controller {
  constructor(@Inject(AuthService) private _authService: AuthService) {
    super();
  }

  @Post("/signUp")
  signUp(@Body() body: CreateProfileDto): Promise<ProfileDto> {
    return this._authService.signUp(body).then(this._transportDto);
  }

  @Post("/signIn")
  signIn(@Body() body: AuthDto): Promise<ProfileDto> {
    return this._authService.signIn(body).then(this._transportDto);
  }

  @Post("/logout")
  logout(): Promise<string> {
    this.setHeader("set-cookie", [
      "access_token=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT",
      "refresh_token=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ]);

    return Promise.resolve("");
  }

  @Get("/refresh")
  @Security("jwt")
  refresh(@Request() req: KoaRequest): Promise<Tokens> {
    const refreshToken = req.ctx.cookies.get("access_token");

    return this._authService
      .updateTokens(refreshToken)
      .then(this._setHeaderTokens);
  }

  private _transportDto = (profile: ProfileDto): ProfileDto => {
    this._setHeaderTokens(profile.tokens);

    return profile;
  };

  private _setHeaderTokens = ({ accessToken, refreshToken }: Tokens) => {
    this.setHeader("set-cookie", [
      `access_token=${accessToken};path=/;`,
      `refresh_token=${refreshToken};path=/;`,
    ]);

    return {
      accessToken,
      refreshToken,
    };
  };
}
