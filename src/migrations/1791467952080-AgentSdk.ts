import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Агенты на agent-sdk: таблицы прежней реализации удаляются, вместо них —
 * хранилище SDK (записи в `jsonb`, `rev` для условной записи), входы задач
 * агентов и токены регистрации. Внешние задачи `job_runs` связываются с
 * задачей исполнителя (`external_id`), курсор событий — `(event_at,
 * event_seq)`. Право `agent:revoke` становится `agent:manage`.
 */
export class AgentSdk1791467952080 implements MigrationInterface {
  name = "AgentSdk1791467952080";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "agent_commands"`);
    await queryRunner.query(`DROP TABLE "agents"`);
    await queryRunner.query(`DROP TABLE "agent_enrollment_tokens"`);

    await queryRunner.query(
      `CREATE TABLE "agents" ("id" uuid NOT NULL, "rev" bigint NOT NULL, "name" character varying(128) NOT NULL, "enrolled_at" bigint NOT NULL, "record" jsonb NOT NULL, CONSTRAINT "PK_9c653f28ae19c5884d5baf6a1d9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENTS_ENROLLED" ON "agents" ("enrolled_at", "id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "agent_jobs" ("id" uuid NOT NULL, "rev" bigint NOT NULL, "status" character varying(16) NOT NULL, "queue" character varying(64) NOT NULL, "agent_id" uuid, "created_at" bigint NOT NULL, "finished_at" bigint, "record" jsonb NOT NULL, CONSTRAINT "PK_3f98df1af8f87d1e2f35c8f7b3c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENT_JOBS_AGENT" ON "agent_jobs" ("agent_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENT_JOBS_STATUS_QUEUE" ON "agent_jobs" ("status", "queue") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENT_JOBS_CREATED" ON "agent_jobs" ("created_at", "id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "agent_commands" ("id" uuid NOT NULL, "rev" bigint NOT NULL, "status" character varying(16) NOT NULL, "agent_id" uuid NOT NULL, "created_at" bigint NOT NULL, "finished_at" bigint, "record" jsonb NOT NULL, CONSTRAINT "PK_da43ab3c04ebfb27fc7f408a311" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENT_COMMANDS_AGENT_STATUS" ON "agent_commands" ("agent_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENT_COMMANDS_CREATED" ON "agent_commands" ("created_at", "id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "agent_states" ("domain" character varying(64) NOT NULL, "agent_id" character varying(36) NOT NULL, "version" bigint NOT NULL, "created_at" bigint NOT NULL, "record" jsonb NOT NULL, CONSTRAINT "PK_4a06121b2a78b0f5e767c5758b9" PRIMARY KEY ("domain", "agent_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "agent_state_history" ("domain" character varying(64) NOT NULL, "agent_id" character varying(36) NOT NULL, "version" bigint NOT NULL, "record" jsonb NOT NULL, CONSTRAINT "PK_81397b318f8661d3b47db983577" PRIMARY KEY ("domain", "agent_id", "version"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "agent_state_versions" ("domain" character varying(64) NOT NULL, "last" bigint NOT NULL, CONSTRAINT "PK_d9352d729ca5aadfc0a39b88e7f" PRIMARY KEY ("domain"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "agent_events" ("seq" BIGSERIAL NOT NULL, "at" bigint NOT NULL, "record" jsonb NOT NULL, CONSTRAINT "PK_6a78c13c8b36e328521b6612889" PRIMARY KEY ("seq"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENT_EVENTS_AT" ON "agent_events" ("at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "agent_metrics" ("id" BIGSERIAL NOT NULL, "agent_id" uuid NOT NULL, "at" bigint NOT NULL, "record" jsonb NOT NULL, CONSTRAINT "PK_bacac16f2d0c796a41cf4d0cee5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENT_METRICS_AT" ON "agent_metrics" ("at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENT_METRICS_AGENT_AT" ON "agent_metrics" ("agent_id", "at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "agent_job_inputs" ("job_id" uuid NOT NULL, "name" character varying(64) NOT NULL, "key" character varying(500) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_0ec006c1634f05e0ccc68208ae4" PRIMARY KEY ("job_id", "name"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "agent_enrollment_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying(100) NOT NULL, "prefix" character varying(8) NOT NULL, "hash" character varying(64) NOT NULL, "labels" jsonb NOT NULL DEFAULT '{}', "max_uses" integer, "uses" integer NOT NULL DEFAULT '0', "expires_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cb5de0c6535594a7e3d03276735" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_AGENT_ENROLLMENT_TOKENS_PREFIX" ON "agent_enrollment_tokens" ("prefix") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENT_ENROLLMENT_TOKENS_CREATED" ON "agent_enrollment_tokens" ("created_at") `,
    );

    await queryRunner.query(`ALTER TABLE "job_runs" DROP COLUMN "accepted_at"`);
    await queryRunner.query(
      `ALTER TABLE "job_runs" ADD "event_at" bigint NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(`ALTER TABLE "job_runs" ADD "external_id" uuid`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_JOB_RUNS_EXTERNAL" ON "job_runs" ("external_id") `,
    );

    await this.renamePermission(queryRunner, "agent:revoke", "agent:manage");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.renamePermission(queryRunner, "agent:manage", "agent:revoke");

    await queryRunner.query(`DROP INDEX "public"."IDX_JOB_RUNS_EXTERNAL"`);
    await queryRunner.query(`ALTER TABLE "job_runs" DROP COLUMN "external_id"`);
    await queryRunner.query(`ALTER TABLE "job_runs" DROP COLUMN "event_at"`);
    await queryRunner.query(
      `ALTER TABLE "job_runs" ADD "accepted_at" TIMESTAMP WITH TIME ZONE`,
    );

    for (const table of [
      "agent_enrollment_tokens",
      "agent_job_inputs",
      "agent_metrics",
      "agent_events",
      "agent_state_versions",
      "agent_state_history",
      "agent_states",
      "agent_commands",
      "agent_jobs",
      "agents",
    ]) {
      await queryRunner.query(`DROP TABLE "${table}"`);
    }

    await queryRunner.query(
      `CREATE TABLE "agents" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying(200) NOT NULL, "labels" jsonb NOT NULL DEFAULT '{}', "status" character varying(16) NOT NULL DEFAULT 'offline', "ephemeral" boolean NOT NULL DEFAULT false, "secret_hash" character varying(64) NOT NULL, "enrollment_token_id" uuid, "session_id" uuid, "transport" character varying(8), "version" character varying(50), "protocol" integer, "host" jsonb, "capabilities" jsonb NOT NULL DEFAULT '{}', "remote_ip" character varying(64), "connected_at" TIMESTAMP WITH TIME ZONE, "last_seen_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9c653f28ae19c5884d5baf6a1d9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENTS_STATUS_SEEN" ON "agents" ("status", "last_seen_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "agent_commands" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "agent_id" uuid NOT NULL, "name" character varying(100) NOT NULL, "args" jsonb, "status" character varying(16) NOT NULL DEFAULT 'pending', "output" text NOT NULL DEFAULT '', "result" jsonb, "error" jsonb, "exit_code" integer, "timeout_sec" integer NOT NULL, "requested_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "started_at" TIMESTAMP WITH TIME ZONE, "finished_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_da43ab3c04ebfb27fc7f408a311" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENT_COMMANDS_STATUS_CREATED" ON "agent_commands" ("status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENT_COMMANDS_AGENT_STATUS" ON "agent_commands" ("agent_id", "status") `,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_commands" ADD CONSTRAINT "FK_d24a34fb6947f812aa8a7b7bab5" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE TABLE "agent_enrollment_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying(100) NOT NULL, "prefix" character varying(8) NOT NULL, "hash" character varying(64) NOT NULL, "labels" jsonb NOT NULL DEFAULT '{}', "max_uses" integer, "uses" integer NOT NULL DEFAULT '0', "ephemeral" boolean NOT NULL DEFAULT false, "expires_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cb5de0c6535594a7e3d03276735" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_AGENT_ENROLLMENT_TOKENS_PREFIX" ON "agent_enrollment_tokens" ("prefix") `,
    );
  }

  /** Право переименовано: у ролей, пользователей и API-ключей доступ тот же. */
  private async renamePermission(
    queryRunner: QueryRunner,
    from: string,
    to: string,
  ): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "permissions" ("name") VALUES ($1) ON CONFLICT ("name") DO NOTHING`,
      [to],
    );

    for (const table of ["role_permissions", "user_permissions"]) {
      const owner = table === "role_permissions" ? "role_id" : "user_id";

      await queryRunner.query(
        `INSERT INTO "${table}" ("${owner}", "permission_id")
         SELECT link."${owner}", target."id"
         FROM "${table}" link
         JOIN "permissions" source ON source."id" = link."permission_id" AND source."name" = $1
         JOIN "permissions" target ON target."name" = $2
         ON CONFLICT DO NOTHING`,
        [from, to],
      );
    }

    await queryRunner.query(
      `UPDATE "api_keys"
       SET "scopes" = ARRAY(SELECT DISTINCT unnest(array_replace("scopes", $1, $2)))
       WHERE $1 = ANY("scopes")`,
      [from, to],
    );
    await queryRunner.query(`DELETE FROM "permissions" WHERE "name" = $1`, [
      from,
    ]);
  }
}
