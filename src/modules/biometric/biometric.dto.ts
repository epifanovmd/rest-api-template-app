export interface IBiometricDto {}

export interface IRegisterBiometricRequestDto {
  userId: string;
  deviceId: string;
  deviceName: string;
  publicKey: string;
}

export interface IRegisterBiometricResponseDto {
  registered: boolean;
}

export interface IGenerateNonceRequestDto {
  userId: string;
}

export interface IGenerateNonceResponseDto {
  nonce: string;
}

export interface IVerifyBiometricSignatureRequestDto {
  userId: string;
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
