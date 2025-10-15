export interface ApnRegisterTokenResponse {
  results?: {
    registration_token: string;
    apns_token: string;
    status: string;
  }[];
}

export interface FCMResponse {
  name: string;
}

export interface FCMMessage {
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
