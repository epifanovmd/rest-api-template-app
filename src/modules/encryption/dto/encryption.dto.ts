export interface KeyBundleDto {
  userId: string;
  deviceId: string;
  identityKey: string;
  signedPreKey: {
    id: number;
    publicKey: string;
    signature: string;
  };
  oneTimePreKey: {
    id: number;
    publicKey: string;
  } | null;
}
