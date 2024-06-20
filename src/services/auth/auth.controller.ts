import { inject as Inject, injectable as Injectable } from "inversify";
import { Body, Controller, Post, Route, Tags } from "tsoa";
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
    return this._authService.signUp(body);
  }

  @Post("/signIn")
  signIn(@Body() body: AuthDto): Promise<ProfileDto> {
    return this._authService.signIn(body);
  }

  @Post("/refresh")
  refresh(@Body() body: { refreshToken: string }): Promise<Tokens> {
    return this._authService.updateTokens(body.refreshToken);
  }
}
