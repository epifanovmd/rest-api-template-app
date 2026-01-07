import { EProfileStatus } from "../profile.types";

export interface IProfileUpdateRequestDto {
  firstName?: string;
  lastName?: string;
  bio?: string;
  birthDate?: Date;
  gender?: string;
  status?: EProfileStatus;
}
