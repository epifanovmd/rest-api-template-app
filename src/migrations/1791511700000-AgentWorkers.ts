import { MigrationInterface, QueryRunner } from "typeorm";

/** Таблицы прежнего хранилища агентов: задачи, команды, желаемое состояние. */
const LEGACY_TABLES = [
  "agent_job_inputs",
  "agent_metrics",
  "agent_events",
  "agent_state_versions",
  "agent_state_history",
  "agent_states",
  "agent_commands",
  "agent_jobs",
  "agents",
];

/**
 * Агенты с воркерами без SDK: хранилище SDK — записи агентов (`agents`,
 * `jsonb` + `rev`) и настройки воркеров (`agent_configs`, версия ключа
 * переживает удаление); история проекта — события воркеров (`agent_events`,
 * ключ — агент и id сообщения) и точки метрик (`agent_metrics`). Прежние
 * таблицы удаляются, агенты регистрируются заново (id агента — 32
 * шестнадцатеричных символа), узлы остаются без агента до повторной
 * регистрации. Внешние задачи `job_runs` связываются с работой у воркера:
 * агент, воркер, id работы и срок; незавершённые задачи прежнего хранилища
 * проваливаются. Права: `agent:state` → `agent:config`, `agent:command` →
 * `agent:fetch` и `agent:logs`, `agent:jobs` удаляется.
 */
export class AgentWorkers1791511700000 implements MigrationInterface {
  name = "AgentWorkers1791511700000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of LEGACY_TABLES) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }

    await queryRunner.query(
      `CREATE TABLE "agents" ("id" character varying(64) NOT NULL, "rev" bigint NOT NULL, "name" character varying(128) NOT NULL, "enrolled_at" bigint NOT NULL, "record" jsonb NOT NULL, CONSTRAINT "PK_9c653f28ae19c5884d5baf6a1d9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENTS_ENROLLED" ON "agents" ("enrolled_at", "id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "agent_configs" ("agent_id" character varying(64) NOT NULL, "worker" character varying(32) NOT NULL, "key" character varying(32) NOT NULL, "version" bigint NOT NULL, "data" jsonb, "updated_at" bigint NOT NULL, "actor" character varying(255), CONSTRAINT "PK_3f1502be21e7f2d05773df56117" PRIMARY KEY ("agent_id", "worker", "key"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "agent_events" ("agent_id" character varying(64) NOT NULL, "id" character varying(64) NOT NULL, "worker" character varying(32) NOT NULL, "type" character varying(64) NOT NULL, "data" jsonb, "at" bigint NOT NULL, "received_at" bigint NOT NULL, CONSTRAINT "PK_f9b070d71a9f804c875455289db" PRIMARY KEY ("agent_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENT_EVENTS_RECEIVED" ON "agent_events" ("received_at", "id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENT_EVENTS_AGENT_RECEIVED" ON "agent_events" ("agent_id", "received_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "agent_metrics" ("id" BIGSERIAL NOT NULL, "agent_id" character varying(64) NOT NULL, "at" bigint NOT NULL, "host" jsonb, "workers" jsonb, CONSTRAINT "PK_bacac16f2d0c796a41cf4d0cee5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENT_METRICS_AGENT_AT" ON "agent_metrics" ("agent_id", "at") `,
    );

    // Работы прежнего хранилища агентов больше никто не ведёт.
    await queryRunner.query(
      `UPDATE "job_runs" SET "status" = 'failed', "finished_at" = now(),
         "error" = '{"code":"EXTERNAL_JOB_LOST","message":"Агенты переведены на новое хранилище"}'::jsonb
       WHERE "external_id" IS NOT NULL AND "status" IN ('queued', 'running')`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_JOB_RUNS_EXTERNAL"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_JOB_RUNS_AGENT_STATUS"`);
    await queryRunner.query(`ALTER TABLE "job_runs" DROP COLUMN "files"`);
    await queryRunner.query(`ALTER TABLE "job_runs" DROP COLUMN "event_seq"`);
    await queryRunner.query(`ALTER TABLE "job_runs" DROP COLUMN "event_at"`);
    await queryRunner.query(
      `ALTER TABLE "job_runs" ALTER COLUMN "agent_id" TYPE character varying(64) USING "agent_id"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_runs" ALTER COLUMN "external_id" TYPE character varying(128) USING "external_id"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_runs" ADD "worker" character varying(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_runs" ADD "deadline_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_JOB_RUNS_AGENT_STATUS" ON "job_runs" ("agent_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_JOB_RUNS_EXTERNAL" ON "job_runs" ("agent_id", "external_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_JOB_RUNS_STATUS_DEADLINE" ON "job_runs" ("status", "deadline_at") `,
    );

    // Прежних агентов нет: узлы ждут повторной регистрации.
    await queryRunner.query(`UPDATE "nodes" SET "agent_id" = NULL`);
    await queryRunner.query(
      `ALTER TABLE "nodes" ALTER COLUMN "agent_id" TYPE character varying(64)`,
    );

    await this.grant(queryRunner, "agent:state", ["agent:config"]);
    await this.grant(queryRunner, "agent:command", ["agent:fetch", "agent:logs"]);
    await this.grant(queryRunner, "agent:jobs", []);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.grant(queryRunner, "agent:config", ["agent:state"]);
    await this.grant(queryRunner, "agent:fetch", ["agent:command"]);
    await this.grant(queryRunner, "agent:logs", ["agent:command"]);
    await queryRunner.query(
      `INSERT INTO "permissions" ("name") VALUES ('agent:jobs') ON CONFLICT ("name") DO NOTHING`,
    );

    await queryRunner.query(`UPDATE "nodes" SET "agent_id" = NULL`);
    await queryRunner.query(
      `ALTER TABLE "nodes" ALTER COLUMN "agent_id" TYPE uuid USING NULL`,
    );

    await queryRunner.query(`DROP INDEX "public"."IDX_JOB_RUNS_STATUS_DEADLINE"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_JOB_RUNS_EXTERNAL"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_JOB_RUNS_AGENT_STATUS"`);
    await queryRunner.query(`ALTER TABLE "job_runs" DROP COLUMN "deadline_at"`);
    await queryRunner.query(`ALTER TABLE "job_runs" DROP COLUMN "worker"`);
    await queryRunner.query(
      `ALTER TABLE "job_runs" ALTER COLUMN "external_id" TYPE uuid USING NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_runs" ALTER COLUMN "agent_id" TYPE uuid USING NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_runs" ADD "event_at" bigint NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_runs" ADD "event_seq" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(`ALTER TABLE "job_runs" ADD "files" jsonb`);
    await queryRunner.query(
      `CREATE INDEX "IDX_JOB_RUNS_AGENT_STATUS" ON "job_runs" ("agent_id", "status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_JOB_RUNS_EXTERNAL" ON "job_runs" ("external_id") `,
    );

    for (const table of [
      "agent_metrics",
      "agent_events",
      "agent_configs",
      "agents",
    ]) {
      await queryRunner.query(`DROP TABLE "${table}"`);
    }

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
  }

  /**
   * Право `from` заменяется правами `to` у ролей, пользователей и API-ключей
   * (доступ тот же); `from` удаляется. Пустой `to` — право просто удаляется.
   */
  private async grant(
    queryRunner: QueryRunner,
    from: string,
    to: string[],
  ): Promise<void> {
    for (const name of to) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("name") VALUES ($1) ON CONFLICT ("name") DO NOTHING`,
        [name],
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
          [from, name],
        );
      }
    }

    await queryRunner.query(
      `UPDATE "api_keys"
       SET "scopes" = ARRAY(SELECT DISTINCT unnest(array_remove("scopes", $1) || $2::varchar[]))
       WHERE $1 = ANY("scopes")`,
      [from, to],
    );
    await queryRunner.query(`DELETE FROM "permissions" WHERE "name" = $1`, [
      from,
    ]);
  }
}
