export interface IBiometricDto {}

export interface IRegisterBiometricRequest {
  userId: string;
  deviceId: string;
  deviceName: string;
  publicKey: string;
}

export interface IRegisterBiometricResponse {
  registered: boolean;
}

export interface IGenerateNonceRequest {
  userId: string;
}

export interface IGenerateNonceResponse {
  nonce: string;
}

export interface IVerifyBiometricSignatureRequest {
  userId: string;
  deviceId: string;
  signature: string;
}

export interface IVerifyBiometricSignatureResponse {
  verified: boolean;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}
