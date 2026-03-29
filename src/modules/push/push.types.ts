export enum EDevicePlatform {
  IOS = "ios",
  ANDROID = "android",
  WEB = "web",
}

export interface IPushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}
