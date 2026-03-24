import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({
  path: [`.env.${process.env.NODE_ENV || "development"}`, ".env"],
});

const port = z.coerce.number().int().positive().max(65535);
const minutes = z.coerce.number().int().positive();
const zeroableInt = z.coerce
  .number()
  .int()
  .transform(v => v || undefined);

const configSchema = z.object({
  server: z.object({
    publicHost: z.string().default("localhost"),
    host: z.string().default("0.0.0.0"),
    port: port.default(8181),
    filesFolderPath: z.string().default("./files"),
  }),

  rateLimit: z.object({
    limit: zeroableInt.default(1000),
    intervalMs: zeroableInt.default(15 * 60 * 1000),
  }),

  cors: z.object({
    allowedIps: z
      .string()
      .transform(str => str.split(",").map(s => s.trim()))
      .pipe(z.array(z.string()))
      .default(["http://localhost:3000"]),
  }),

  auth: z.object({
    jwt: z.object({
      secretKey: z.string().min(1).default("wg-api-secret-key"),
    }),
    admin: z.object({
      email: z.string().email().default("admin@admin.com"),
      password: z.string().min(6).default("admin"),
    }),
    otp: z.object({
      expireMinutes: minutes.default(10),
    }),
    resetPassword: z.object({
      expireMinutes: minutes.default(60),
      webUrl: z
        .string()
        .default("http://localhost:3000/reset-password?token={{token}}"),
    }),
    webAuthn: z.object({
      rpName: z.string().default("WireGuard VPN"),
      rpHost: z.string().default("localhost"),
      rpSchema: z.string().default("http"),
      rpPort: z.string().default("3000"),
    }),
  }),

  database: z.object({
    postgres: z.object({
      host: z.string().default("localhost"),
      port: port.default(5432),
      database: z.string().min(1).default("postgres"),
      username: z.string().min(1).default("pg_user_name"),
      password: z.string().default("pg_password"),
      dataPath: z.string().default("/data/postgres"),
    }),
  }),

  email: z.object({
    smtp: z.object({
      user: z.string().default(""),
      pass: z.string().default(""),
    }),
  }),

  wireguard: z.object({
    binaryPath: z.string().default("wg"),
    quickBinaryPath: z.string().default("wg-quick"),
    configDir: z.string().default("/etc/wireguard"),
    dbWriteIntervalSec: z.coerce.number().int().positive().default(60),
    socketPollIntervalSec: z.coerce.number().int().positive().default(1),
    statsRetentionDays: z.coerce.number().int().positive().default(30),
    /** Правила iptables по умолчанию, применяемые к каждому новому серверу, если не переопределено */
    defaults: z.object({
      preUp: z.string().default(""),
      preDown: z.string().default(""),
      postUp: z
        .string()
        .default(
          "iptables -A FORWARD -i %i -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE",
        ),
      postDown: z
        .string()
        .default(
          "iptables -D FORWARD -i %i -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE",
        ),
    }),
  }),
});

export type Config = z.infer<typeof configSchema>;

const { env } = process;

export const config: Config = configSchema.parse({
  server: {
    publicHost: env.PUBLIC_HOST,
    host: env.SERVER_HOST,
    port: env.SERVER_PORT,
    filesFolderPath: env.SERVER_FILES_FOLDER_PATH,
  },
  rateLimit: {
    limit: env.RATE_LIMIT,
    intervalMs: env.RATE_LIMIT_INTERVAL,
  },
  cors: {
    allowedIps: env.CORS_ALLOW_IPS,
  },
  auth: {
    jwt: { secretKey: env.JWT_SECRET_KEY },
    admin: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
    otp: { expireMinutes: env.OTP_EXPIRE_MINUTES },
    resetPassword: {
      expireMinutes: env.RESET_PASS_TOKEN_EXPIRE_MINUTES,
      webUrl: env.WEB_URL_RESET_PASSWORD,
    },
    webAuthn: {
      rpName: env.WEB_AUTHN_RP_NAME,
      rpHost: env.WEB_AUTHN_RP_HOST,
      rpSchema: env.WEB_AUTHN_RP_SCHEMA,
      rpPort: env.WEB_AUTHN_RP_PORT,
    },
  },
  database: {
    postgres: {
      host: env.POSTGRES_HOST,
      port: env.POSTGRES_PORT,
      database: env.POSTGRES_DB,
      username: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,
      dataPath: env.POSTGRES_DATA,
    },
  },
  email: {
    smtp: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  },
  wireguard: {
    binaryPath: env.WG_BINARY_PATH,
    quickBinaryPath: env.WG_QUICK_BINARY_PATH,
    configDir: env.WG_CONFIG_DIR,
    dbWriteIntervalSec: env.WG_DB_WRITE_INTERVAL_SEC,
    socketPollIntervalSec: env.WG_SOCKET_POLL_INTERVAL_SEC,
    statsRetentionDays: env.WG_STATS_RETENTION_DAYS,
    defaults: {
      preUp: env.WG_DEFAULT_PRE_UP,
      preDown: env.WG_DEFAULT_PRE_DOWN,
      postUp: env.WG_DEFAULT_POST_UP,
      postDown: env.WG_DEFAULT_POST_DOWN,
    },
  },
});
