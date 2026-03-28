import { z } from "zod";

/** Hostnames that must never be used as webhook targets. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "0.0.0.0",
  "[::]",
  "[::1]",
  "metadata.google.internal",
]);

/** Quick pre-flight check — rejects obviously internal URLs at validation time. */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(h)) return true;

  // IPv4 loopback 127.x.x.x
  if (h.startsWith("127.")) return true;

  // RFC1918 private ranges
  if (h.startsWith("10.")) return true;
  if ((/^172\.(1[6-9]|2\d|3[01])\./).test(h)) return true;
  if (h.startsWith("192.168.")) return true;

  // Link-local (AWS/GCP/Azure metadata)
  if (h.startsWith("169.254.")) return true;

  // IPv6 loopback
  if (h === "::1" || h === "[::1]") return true;

  return false;
}

export const SetWebhookSchema = z.object({
  url: z
    .string()
    .url()
    .max(500)
    .refine(
      val => {
        try {
          const parsed = new URL(val);

          // Only allow http/https
          if (
            parsed.protocol !== "https:" &&
            parsed.protocol !== "http:"
          ) {
            return false;
          }

          return !isBlockedHost(parsed.hostname);
        } catch {
          return false;
        }
      },
      {
        message:
          "Webhook URL must be a public HTTP(S) address. Private/internal addresses are not allowed.",
      },
    ),
  secret: z.string().max(100).optional(),
});
