import { z } from "zod";

export const WgServerCreateSchema = z.object({
  name: z.string().min(1).max(100),
  interface: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[a-zA-Z0-9_-]+$/, "Interface name must be alphanumeric"),
  listenPort: z.number().int().min(1024).max(65535),
  address: z
    .string()
    .regex(
      /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/,
      "Must be a valid CIDR address",
    ),
  dns: z.string().optional(),
  endpoint: z.string().optional(),
  mtu: z.number().int().min(576).max(9000).optional(),
  preUp: z.string().optional(),
  preDown: z.string().optional(),
  postUp: z.string().optional(),
  postDown: z.string().optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
});

export const WgServerUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  listenPort: z.number().int().min(1024).max(65535).optional(),
  address: z
    .string()
    .regex(/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/)
    .optional(),
  dns: z.string().nullable().optional(),
  endpoint: z.string().nullable().optional(),
  mtu: z.number().int().min(576).max(9000).nullable().optional(),
  preUp: z.string().nullable().optional(),
  preDown: z.string().nullable().optional(),
  postUp: z.string().nullable().optional(),
  postDown: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});
