import dotenv from "dotenv";

dotenv.config({
  path: [`.env.${process.env.NODE_ENV || "development"}`, ".env"],
});

export const config = {
  PUBLIC_HOST: process.env.PUBLIC_HOST,
  SERVER_HOST: process.env.SERVER_HOST || "0.0.0.0",
  SERVER_PORT: Number(process.env.SERVER_PORT || 8181),
  SOCKET_PORT: process.env.SOCKET_PORT || 3232,

  SERVER_FILES_FOLDER_PATH:
    process.env.SERVER_FILES_FOLDER_PATH ?? "./upload_files",

  RATE_LIMIT: process.env.RATE_LIMIT || 1000,
  RATE_LIMIT_INTERVAL: process.env.RATE_LIMIT_INTERVAL || 15 * 60 * 1000, // 15 minutes
  CORS_ALLOW_IPS:
    process.env.CORS_ALLOW_IPS ||
    "http://localhost:3000,https://socket-test-client.netlify.app",

  JWT_SECRET_KEY: process.env.SOCKET_PORT || "rest-api--auth-secret-key",

  REDIS_PASS: process.env.REDIS_PASS || "redisPass",

  REDIS_HOST: process.env.REDIS_HOST || "localhost",
  REDIS_PORT: process.env.REDIS_PORT || 6379,

  POSTGRES_HOST: process.env.POSTGRES_HOST || "localhost",
  POSTGRES_PORT: Number(process.env.POSTGRES_PORT || 5432),
  POSTGRES_DATABASE: process.env.POSTGRES_DATABASE || "postgres",
  POSTGRES_USER: process.env.POSTGRES_USER || "pg_user_name",
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || "pg_password",

  PGDATA: process.env.PGDATA || "/data/postgres",
  PGADMIN_DEFAULT_EMAIL:
    process.env.PGADMIN_DEFAULT_EMAIL || "pgadmin@gmail.com",
  PGADMIN_DEFAULT_PASSWORD: process.env.PGADMIN_DEFAULT_PASSWORD || "pgadmin",
};
