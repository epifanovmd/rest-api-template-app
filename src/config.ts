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

const nodeEnvSchema = z
  .enum(["development", "production", "test"])
  .default("development");

export const nodeEnv = nodeEnvSchema.parse(process.env.NODE_ENV);
export const isProduction = nodeEnv === "production";
export const isDevelopment = nodeEnv === "development";

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
      secretKey: z.string().min(16),
    }),
    admin: z.object({
      email: z.string().email(),
      password: z.string().min(8),
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
      rpName: z.string().default("Test"),
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
      ssl: z
        .string()
        .default("false")
        .transform(v => v === "true"),
      poolMax: z.coerce.number().int().positive().default(20),
      dataPath: z.string().default("/data/postgres"),
    }),
  }),

  email: z.object({
    smtp: z.object({
      user: z.string().default(""),
      pass: z.string().default(""),
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
      ssl: env.POSTGRES_SSL,
      poolMax: env.POSTGRES_POOL_MAX,
      dataPath: env.POSTGRES_DATA,
    },
  },
  email: {
    smtp: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  },
});
