export interface FcmTokenDto {
  id: number;
  userId: string;
  token: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FcmTokenRequestDto {
  token: string;
}

export interface IApnRegisterTokenResponseDto {
  results?: {
    registration_token: string;
    apns_token: string;
    status: string;
  }[];
}

export interface IFCMMessageDto {
  dialogId?: string;
  link?: string;
  to: string;
  message: {
    title: string;
    description?: string;
    image?: string;
    sound?: string;
  };
  badge?: number;
  type?: "token" | "topic";
  data?: {
    [key: string]: string;
  };
}
