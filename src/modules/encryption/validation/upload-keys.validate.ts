import { z } from "zod";

export const UploadKeysSchema = z.object({
  deviceId: z.string().min(1).max(100),
  identityKey: z.string().min(1),
  signedPreKey: z.object({
    id: z.number().int(),
    publicKey: z.string().min(1),
    signature: z.string().min(1),
  }),
  oneTimePreKeys: z
    .array(
      z.object({
        id: z.number().int(),
        publicKey: z.string().min(1),
      }),
    )
    .max(100)
    .default([]),
});

export const UploadPreKeysSchema = z.object({
  keys: z
    .array(
      z.object({
        id: z.number().int(),
        publicKey: z.string().min(1),
      }),
    )
    .min(1)
    .max(100),
});
