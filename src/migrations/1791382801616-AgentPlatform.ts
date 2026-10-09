import { MigrationInterface, QueryRunner } from "typeorm";

export class AgentPlatform1791382801616 implements MigrationInterface {
    name = 'AgentPlatform1791382801616'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Присутствие внешних воркеров заменено агентами (таблица agents).
        await queryRunner.query(`DROP TABLE "job_workers"`);
        await queryRunner.query(`CREATE TABLE "agents" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying(200) NOT NULL, "labels" jsonb NOT NULL DEFAULT '{}', "status" character varying(16) NOT NULL DEFAULT 'offline', "ephemeral" boolean NOT NULL DEFAULT false, "secret_hash" character varying(64) NOT NULL, "enrollment_token_id" uuid, "session_id" uuid, "transport" character varying(8), "version" character varying(50), "protocol" integer, "host" jsonb, "capabilities" jsonb NOT NULL DEFAULT '{}', "remote_ip" character varying(64), "connected_at" TIMESTAMP WITH TIME ZONE, "last_seen_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9c653f28ae19c5884d5baf6a1d9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_AGENTS_STATUS_SEEN" ON "agents"  ("status", "last_seen_at") `);
        await queryRunner.query(`CREATE TABLE "agent_commands" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "agent_id" uuid NOT NULL, "name" character varying(100) NOT NULL, "args" jsonb, "status" character varying(16) NOT NULL DEFAULT 'pending', "output" text NOT NULL DEFAULT '', "result" jsonb, "error" jsonb, "exit_code" integer, "timeout_sec" integer NOT NULL, "requested_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "started_at" TIMESTAMP WITH TIME ZONE, "finished_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_da43ab3c04ebfb27fc7f408a311" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_AGENT_COMMANDS_STATUS_CREATED" ON "agent_commands"  ("status", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_AGENT_COMMANDS_AGENT_STATUS" ON "agent_commands"  ("agent_id", "status") `);
        await queryRunner.query(`CREATE TABLE "agent_enrollment_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying(100) NOT NULL, "prefix" character varying(8) NOT NULL, "hash" character varying(64) NOT NULL, "labels" jsonb NOT NULL DEFAULT '{}', "max_uses" integer, "uses" integer NOT NULL DEFAULT '0', "ephemeral" boolean NOT NULL DEFAULT false, "expires_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cb5de0c6535594a7e3d03276735" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_AGENT_ENROLLMENT_TOKENS_PREFIX" ON "agent_enrollment_tokens"  ("prefix") `);
        await queryRunner.query(`ALTER TABLE "job_runs" ADD "agent_id" uuid`);
        await queryRunner.query(`ALTER TABLE "job_runs" ADD "accepted_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`CREATE INDEX "IDX_JOB_RUNS_AGENT_STATUS" ON "job_runs"  ("agent_id", "status") `);
        await queryRunner.query(`ALTER TABLE "agent_commands" ADD CONSTRAINT "FK_d24a34fb6947f812aa8a7b7bab5" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "agent_commands" DROP CONSTRAINT "FK_d24a34fb6947f812aa8a7b7bab5"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_JOB_RUNS_AGENT_STATUS"`);
        await queryRunner.query(`ALTER TABLE "job_runs" DROP COLUMN "accepted_at"`);
        await queryRunner.query(`ALTER TABLE "job_runs" DROP COLUMN "agent_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_AGENT_ENROLLMENT_TOKENS_PREFIX"`);
        await queryRunner.query(`DROP TABLE "agent_enrollment_tokens"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_AGENT_COMMANDS_AGENT_STATUS"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_AGENT_COMMANDS_STATUS_CREATED"`);
        await queryRunner.query(`DROP TABLE "agent_commands"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_AGENTS_STATUS_SEEN"`);
        await queryRunner.query(`DROP TABLE "agents"`);
        await queryRunner.query(`CREATE TABLE "job_workers" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying(200) NOT NULL, "queue" character varying(100) NOT NULL, "key_id" character varying(100), "meta" jsonb NOT NULL DEFAULT '{}', "last_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_25a2b482332defbe350938ba653" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_JOB_WORKERS_QUEUE_SEEN" ON "job_workers"  ("queue", "last_seen_at") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_JOB_WORKERS_NAME_QUEUE" ON "job_workers"  ("name", "queue") `);
    }

}
