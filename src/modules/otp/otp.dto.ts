import { IListResponseDto } from "../../core";

export interface IOtpDto {
  userId: string;
  code: string;
  expireAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOtpListDto extends IListResponseDto<IOtpDto[]> {}
