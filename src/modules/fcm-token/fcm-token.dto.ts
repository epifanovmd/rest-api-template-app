export interface FcmTokenDto {
  id: number;
  userId: string;
  token: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FcmTokenRequest {
  token: string;
}
