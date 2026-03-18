import { z } from "zod";

const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;

export const WgPeerCreateSchema = z.object({
  name: z.string().min(1).max(100),
  presharedKey: z.boolean().optional(),
  persistentKeepalive: z.number().int().min(1).max(65535).optional(),
  dns: z.string().optional(),
  mtu: z.number().int().min(576).max(9000).optional(),
  clientAllowedIPs: z.string().optional(),
  endpoint: z.string().optional(),
  description: z.string().optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  enabled: z.boolean().optional(),
});

export const WgPeerUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  allowedIPs: z.string().regex(cidrRegex).optional(),
  userId: z.string().uuid().nullable().optional(),
  presharedKey: z.boolean().nullable().optional(),
  persistentKeepalive: z.number().int().min(1).max(65535).nullable().optional(),
  dns: z.string().nullable().optional(),
  mtu: z.number().int().min(576).max(9000).nullable().optional(),
  clientAllowedIPs: z.string().optional(),
  endpoint: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  enabled: z.boolean().optional(),
});
