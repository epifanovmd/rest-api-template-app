import { EDevicePlatform } from "../push.types";

export interface IRegisterDeviceBody {
  token: string;
  platform: EDevicePlatform;
  deviceName?: string;
}

export interface IUpdateNotificationSettingsBody {
  muteAll?: boolean;
  soundEnabled?: boolean;
  showPreview?: boolean;
}
