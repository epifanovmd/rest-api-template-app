import { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/types";
import { inject, injectable } from "inversify";
import { Body, Controller, Post, Route, Tags } from "tsoa";

import {
  IVerifyAuthenticationRequest,
  IVerifyAuthenticationResponse,
  IVerifyRegistrationRequest,
} from "./passkeys.model";
import { PasskeysService } from "./passkeys.service";

@injectable()
@Tags("Passkeys")
@Route("api/passkeys")
export class PasskeysController extends Controller {
  constructor(@inject(PasskeysService) private _authService: PasskeysService) {
    super();
  }

  @Post("/generate-registration-options")
  async generateRegistrationOptions(
    @Body() { profileId }: { profileId: string },
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    return await this._authService.generateRegistrationOptions(profileId);
  }

  @Post("/verify-registration")
  async verifyRegistration(
    @Body() { profileId, data }: IVerifyRegistrationRequest,
  ): Promise<{
    verified: boolean;
  }> {
    return await this._authService.verifyRegistration(profileId, data);
  }

  @Post("/generate-authentication-options")
  async generateAuthenticationOptions(
    @Body() { profileId }: { profileId: string },
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    return await this._authService.generateAuthenticationOptions(profileId);
  }

  @Post("/verify-authentication")
  async verifyAuthentication(
    @Body() { profileId, data }: IVerifyAuthenticationRequest,
  ): Promise<IVerifyAuthenticationResponse> {
    return await this._authService.verifyAuthentication(profileId, data);
  }
}
