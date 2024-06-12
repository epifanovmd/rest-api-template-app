export type Profile = {
  id: string;
  username: string;
  name: string;
  email?: string;
  salt: string;
  password: string;
};

export interface AuthDto {
  username: string;
  password: string;
}

export type PrivateProfile = Omit<Profile, "salt" | "password">;

export interface ProfileDto extends PrivateProfile {
  tokens: Tokens;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface CreateProfileDto
  extends AuthDto,
    Pick<Profile, "email" | "name"> {}
