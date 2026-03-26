export interface IRegisterBiometricRequestDto {
  deviceId: string;
  deviceName: string;
  publicKey: string;
}

export interface IRegisterBiometricResponseDto {
  registered: boolean;
}

export interface IGenerateNonceRequestDto {
  deviceId: string;
}

export interface IGenerateNonceResponseDto {
  nonce: string;
}

export interface IVerifyBiometricSignatureRequestDto {
  deviceId: string;
  signature: string;
}

export interface IVerifyBiometricSignatureResponseDto {
  verified: boolean;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

export interface IBiometricDeviceDto {
  id: string;
  deviceId: string;
  deviceName: string;
  lastUsedAt: Date;
  createdAt: Date;
}

export interface IBiometricDevicesResponseDto {
  devices: IBiometricDeviceDto[];
}

export interface IDeleteBiometricResponseDto {
  deleted: boolean;
}
