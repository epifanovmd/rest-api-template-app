import dotenv from "dotenv";

dotenv.config({
  path: [`.env.${process.env.NODE_ENV || "development"}`, ".env"],
});

export const config = {
  server: {
    publicHost: process.env.PUBLIC_HOST || "http://localhost:3000",
    host: process.env.SERVER_HOST || "0.0.0.0",
    port: Number(process.env.SERVER_PORT || 8181),
    filesFolderPath: process.env.SERVER_FILES_FOLDER_PATH || "./files",
  },
  socket: {
    port: Number(process.env.SOCKET_PORT || 3232),
  },
  rateLimit: {
    limit: Number(process.env.RATE_LIMIT || 1000),
    intervalMs: Number(process.env.RATE_LIMIT_INTERVAL || 15 * 60 * 1000),
  },
  cors: {
    allowedIps: (
      process.env.CORS_ALLOW_IPS ||
      "http://localhost:3000,https://socket-test-client.netlify.app"
    )
      .split(",")
      .map(ip => ip.trim()),
  },
  auth: {
    jwt: {
      secretKey: process.env.JWT_SECRET_KEY || "rest-api--auth-secret-key",
    },
    admin: {
      email: process.env.ADMIN_EMAIL || "admin@admin.com",
      password: process.env.ADMIN_PASSWORD || "admin",
    },
    webAuthn: {
      rpName: process.env.WEB_AUTHN_RP_NAME || "domain",
      rpHost: process.env.WEB_AUTHN_RP_HOST || "domain.ru",
      rpSchema: process.env.WEB_AUTHN_RP_SCHEMA || "https",
      rpPort: process.env.WEB_AUTHN_RP_PORT || "",
    },
    otp: {
      expireMinutes: Number(process.env.OTP_EXPIRE_MINUTES || 10),
    },
    resetPassword: {
      expireMinutes: Number(process.env.RESET_PASS_TOKEN_EXPIRE_MINUTES || 60),
      webUrl:
        process.env.WEB_URL_RESET_PASSWORD ||
        "https://domain/reset-password?token={{token}}",
    },
  },
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASS || "redisPass",
  },
  database: {
    postgres: {
      host: process.env.POSTGRES_HOST || "localhost",
      port: Number(process.env.POSTGRES_PORT || 5432),
      database: process.env.POSTGRES_DB || "postgres",
      username: process.env.POSTGRES_USER || "pg_user_name",
      password: process.env.POSTGRES_PASSWORD || "pg_password",
      dataPath: process.env.POSTGRES_DATA || "/data/postgres",
    },
  },
  email: {
    smtp: {
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    },
  },
};
