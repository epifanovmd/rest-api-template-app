import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({
  path: [`.env.${process.env.NODE_ENV || "development"}`, ".env"],
});

const port = z.coerce.number().int().positive().max(65535);
const minutes = z.coerce.number().int().positive();
const zeroableInt = z.coerce.number().int().transform(v => v || undefined);

const configSchema = z.object({
  server: z.object({
    publicHost: z.ipv4().default("localhost"),
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
      .default(["http://localhost:3000,https://socket-test-client.netlify.app"])
      .pipe(z.array(z.url())),
  }),

  auth: z.object({
    jwt: z.object({
      secretKey: z.string().min(1).default("rest-api--auth-secret-key"),
    }),
    admin: z.object({
      email: z.string().email().default("admin@admin.com"),
      password: z.string().min(6).default("admin"),
    }),
    webAuthn: z.object({
      rpName: z.string().min(1).default("domain"),
      rpHost: z.string().min(1).default("domain.ru"),
      rpSchema: z.enum(["http", "https"]).default("https"),
      rpPort: z.string().default(""),
    }),
    otp: z.object({
      expireMinutes: minutes.default(10),
    }),
    resetPassword: z.object({
      expireMinutes: minutes.default(60),
      webUrl: z.url().default("https://domain/reset-password?token={{token}}"),
    }),
    github: z.object({
      clientId: z.string().default(""),
      clientSecret: z.string().default(""),
    }),
  }),

  redis: z.object({
    host: z.string().default("localhost"),
    port: port.default(6379),
    password: z.string().default("redisPass"),
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

  fcm: z.object({
    serviceAccountPath: z.string().default("firebaseAccount.json"),
  }),
});

export type Config = z.infer<typeof configSchema>;

const { env } = process;

export const config = configSchema.parse({
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
    webAuthn: {
      rpName: env.WEB_AUTHN_RP_NAME,
      rpHost: env.WEB_AUTHN_RP_HOST,
      rpSchema: env.WEB_AUTHN_RP_SCHEMA,
      rpPort: env.WEB_AUTHN_RP_PORT,
    },
    otp: { expireMinutes: env.OTP_EXPIRE_MINUTES },
    resetPassword: {
      expireMinutes: env.RESET_PASS_TOKEN_EXPIRE_MINUTES,
      webUrl: env.WEB_URL_RESET_PASSWORD,
    },
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    },
  },
  redis: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASS,
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
  fcm: {
    serviceAccountPath: env.FCM_SERVICE_ACCOUNT_PATH,
  },
});
