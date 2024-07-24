export interface IProfileData {
  username: string;
  name: string;
  email?: string;
}

export interface IProfilePassword {
  password: string;
}

export interface IProfileDto extends IProfileData {
  id: string;
}

export interface IProfileModel extends IProfileDto, IProfilePassword {}

export interface ITokensDto {
  accessToken: string;
  refreshToken: string;
}

export interface IProfileWithTokensDto extends IProfileDto {
  tokens: ITokensDto;
}

export interface ISignInRequestDto {
  username: string;
  password: string;
}

export interface ISignUpRequestDto extends ISignInRequestDto, IProfileData {}
