import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({
  path: [`.env.${process.env.NODE_ENV || "development"}`, ".env"],
});

// Схемы валидации
const serverSchema = z.object({
  publicHost: z.ipv4().default("localhost"),
  host: z.string().default("0.0.0.0"),
  port: z.coerce.number().int().positive().max(65535).default(8181),
  filesFolderPath: z.string().default("./files"),
});

const t = z.coerce.number().safeParse("");

const rateLimitSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .transform(value => (value === 0 ? undefined : value))
    .default(1000),
  intervalMs: z.coerce
    .number()
    .int()
    .transform(value => (value === 0 ? undefined : value))
    .default(15 * 60 * 1000),
});

const corsSchema = z.object({
  allowedIps: z
    .string()
    .transform(str => str.split(",").map(ip => ip.trim()))
    .default(["http://localhost:3000,https://socket-test-client.netlify.app"])
    .pipe(z.array(z.url())),
});

const jwtSchema = z.object({
  secretKey: z.string().min(1).default("rest-api--auth-secret-key"),
});

const adminSchema = z.object({
  email: z.string().email().default("admin@admin.com"),
  password: z.string().min(6).default("admin"),
});

const webAuthnSchema = z.object({
  rpName: z.string().min(1).default("domain"),
  rpHost: z.string().min(1).default("domain.ru"),
  rpSchema: z.enum(["http", "https"]).default("https"),
  rpPort: z.string().default(""),
});

const otpSchema = z.object({
  expireMinutes: z.coerce.number().int().positive().default(10),
});

const resetPasswordSchema = z.object({
  expireMinutes: z.coerce.number().int().positive().default(60),
  webUrl: z.url().default("https://domain/reset-password?token={{token}}"),
});

const githubSchema = z.object({
  clientId: z.string().default(""),
  clientSecret: z.string().default(""),
});

const authSchema = z.object({
  jwt: jwtSchema,
  admin: adminSchema,
  webAuthn: webAuthnSchema,
  otp: otpSchema,
  resetPassword: resetPasswordSchema,
  github: githubSchema,
});

const redisSchema = z.object({
  host: z.string().default("localhost"),
  port: z.coerce.number().int().positive().max(65535).default(6379),
  password: z.string().default("redisPass"),
});

const postgresSchema = z.object({
  host: z.string().default("localhost"),
  port: z.coerce.number().int().positive().max(65535).default(5432),
  database: z.string().min(1).default("postgres"),
  username: z.string().min(1).default("pg_user_name"),
  password: z.string().default("pg_password"),
  dataPath: z.string().default("/data/postgres"),
});

const databaseSchema = z.object({
  postgres: postgresSchema,
});

const smtpSchema = z.object({
  user: z.email().optional().default(""),
  pass: z.string().optional().default(""),
});

const emailSchema = z.object({
  smtp: smtpSchema,
});

// Основная схема конфигурации
const configSchema = z.object({
  server: serverSchema,
  rateLimit: rateLimitSchema,
  cors: corsSchema,
  auth: authSchema,
  redis: redisSchema,
  database: databaseSchema,
  email: emailSchema,
});

// Тип на основе схемы
export type Config = z.infer<typeof configSchema>;
// Создание и валидация конфигурации
export const config = configSchema.parse({
  server: {
    publicHost: process.env.PUBLIC_HOST,
    host: process.env.SERVER_HOST,
    port: process.env.SERVER_PORT,
    filesFolderPath: process.env.SERVER_FILES_FOLDER_PATH,
  },
  rateLimit: {
    limit: process.env.RATE_LIMIT,
    intervalMs: process.env.RATE_LIMIT_INTERVAL,
  },
  cors: {
    allowedIps: process.env.CORS_ALLOW_IPS,
  },
  auth: {
    jwt: {
      secretKey: process.env.JWT_SECRET_KEY,
    },
    admin: {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    },
    webAuthn: {
      rpName: process.env.WEB_AUTHN_RP_NAME,
      rpHost: process.env.WEB_AUTHN_RP_HOST,
      rpSchema: process.env.WEB_AUTHN_RP_SCHEMA,
      rpPort: process.env.WEB_AUTHN_RP_PORT,
    },
    otp: {
      expireMinutes: process.env.OTP_EXPIRE_MINUTES,
    },
    resetPassword: {
      expireMinutes: process.env.RESET_PASS_TOKEN_EXPIRE_MINUTES,
      webUrl: process.env.WEB_URL_RESET_PASSWORD,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    },
  },
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASS,
  },
  database: {
    postgres: {
      host: process.env.POSTGRES_HOST,
      port: process.env.POSTGRES_PORT,
      database: process.env.POSTGRES_DB,
      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      dataPath: process.env.POSTGRES_DATA,
    },
  },
  email: {
    smtp: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  },
});
