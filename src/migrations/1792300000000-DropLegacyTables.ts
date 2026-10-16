import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Удаление устаревших таблиц и их прав.
 * `down` возвращает только структуру таблиц — данные и права не восстанавливаются.
 */
export class DropLegacyTables1792300000000 implements MigrationInterface {
  name = "DropLegacyTables1792300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_commands" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_configs" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_enrollment_tokens" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_events" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_issues" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_metrics" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agents" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "job_runs" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "nodes" CASCADE`);
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "name" LIKE 'agent:%' OR "name" LIKE 'node:%' OR "name" LIKE 'jobs:%'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE public.agent_commands ( seq bigint NOT NULL, id character varying(64) NOT NULL, agent_id character varying(32) NOT NULL, type character varying(64) NOT NULL, args jsonb, worker character varying(32), worker_type character varying(64), deadline_at timestamp with time zone, status character varying(16) DEFAULT 'pending'::character varying NOT NULL, ok boolean, result jsonb, error jsonb, progress real, progress_text character varying(200), actor character varying(255), created_at timestamp with time zone DEFAULT now() NOT NULL, finished_at timestamp with time zone )`,
    );
    await queryRunner.query(
      `CREATE SEQUENCE public.agent_commands_seq_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1`,
    );
    await queryRunner.query(
      `ALTER SEQUENCE public.agent_commands_seq_seq OWNED BY public.agent_commands.seq`,
    );
    await queryRunner.query(
      `CREATE TABLE public.agent_configs ( agent_id character varying(32) NOT NULL, worker character varying(32) NOT NULL, key character varying(32) NOT NULL, version bigint NOT NULL, data jsonb, actor character varying(255), updated_at timestamp with time zone NOT NULL )`,
    );
    await queryRunner.query(
      `CREATE TABLE public.agent_enrollment_tokens ( id uuid DEFAULT gen_random_uuid() NOT NULL, name character varying(100) NOT NULL, prefix character varying(8) NOT NULL, hash character varying(64) NOT NULL, labels jsonb DEFAULT '{}'::jsonb NOT NULL, max_uses integer, uses integer DEFAULT 0 NOT NULL, expires_at timestamp with time zone, revoked_at timestamp with time zone, created_by uuid, created_at timestamp with time zone DEFAULT now() NOT NULL )`,
    );
    await queryRunner.query(
      `CREATE TABLE public.agent_events ( agent_id character varying(32) NOT NULL, id character varying(128) NOT NULL, worker character varying(32) NOT NULL, type character varying(64) NOT NULL, data jsonb, problems jsonb, at bigint NOT NULL, received_at bigint NOT NULL )`,
    );
    await queryRunner.query(
      `CREATE TABLE public.agent_issues ( id uuid DEFAULT gen_random_uuid() NOT NULL, params jsonb NOT NULL, created_by uuid, created_at timestamp with time zone DEFAULT now() NOT NULL, expires_at timestamp with time zone NOT NULL, downloaded_at timestamp with time zone, token_id uuid )`,
    );
    await queryRunner.query(
      `CREATE TABLE public.agent_metrics ( id bigint NOT NULL, agent_id character varying(32) NOT NULL, at bigint NOT NULL, host jsonb, workers jsonb )`,
    );
    await queryRunner.query(
      `CREATE SEQUENCE public.agent_metrics_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1`,
    );
    await queryRunner.query(
      `ALTER SEQUENCE public.agent_metrics_id_seq OWNED BY public.agent_metrics.id`,
    );
    await queryRunner.query(
      `CREATE TABLE public.agents ( id character varying(32) NOT NULL, name character varying(128) NOT NULL, labels jsonb DEFAULT '{}'::jsonb NOT NULL, token_labels jsonb DEFAULT '{}'::jsonb NOT NULL, secret_hash character varying(64) NOT NULL, pending_secret_hash character varying(64), host jsonb, hello jsonb, state jsonb, metrics jsonb, desired_rev bigint DEFAULT 1 NOT NULL, watch jsonb, stream_instance character varying(128), last_seen_at timestamp with time zone, remote_ip character varying(64), revoked_at timestamp with time zone, enroll_token_id uuid, enrolled_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, deleted_at timestamp with time zone )`,
    );
    await queryRunner.query(
      `CREATE TABLE public.job_runs ( id uuid NOT NULL, queue character varying(100) NOT NULL, status character varying(16) DEFAULT 'queued'::character varying NOT NULL, title character varying(200) NOT NULL, progress real DEFAULT '0'::real NOT NULL, progress_text character varying(200), log_tail jsonb DEFAULT '[]'::jsonb NOT NULL, result jsonb, error jsonb, owner_id uuid, scope_type character varying(50), scope_id character varying(100), attempt integer DEFAULT 0 NOT NULL, cancel_requested boolean DEFAULT false NOT NULL, lease_until timestamp with time zone, started_at timestamp with time zone, finished_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, agent_id character varying(64), external_id character varying(128), worker character varying(32), deadline_at timestamp with time zone, job_type character varying(64), outputs jsonb )`,
    );
    await queryRunner.query(
      `CREATE TABLE public.nodes ( id uuid DEFAULT gen_random_uuid() NOT NULL, name character varying(120) NOT NULL, description text, host character varying(255), owner_id uuid, created_by_id uuid, agent_id character varying(64), created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, agent_name character varying(128) )`,
    );
    await queryRunner.query(
      `ALTER TABLE ONLY public.agent_commands ALTER COLUMN seq SET DEFAULT nextval('public.agent_commands_seq_seq'::regclass)`,
    );
    await queryRunner.query(
      `ALTER TABLE ONLY public.agent_metrics ALTER COLUMN id SET DEFAULT nextval('public.agent_metrics_id_seq'::regclass)`,
    );
    await queryRunner.query(
      `ALTER TABLE ONLY public.job_runs ADD CONSTRAINT "PK_4d0012c04fcfc287550b76be7e9" PRIMARY KEY (id)`,
    );
    await queryRunner.query(
      `ALTER TABLE ONLY public.nodes ADD CONSTRAINT "PK_682d6427523a0fa43d062ea03ee" PRIMARY KEY (id)`,
    );
    await queryRunner.query(
      `ALTER TABLE ONLY public.agent_enrollment_tokens ADD CONSTRAINT "PK_cb5de0c6535594a7e3d03276735" PRIMARY KEY (id)`,
    );
    await queryRunner.query(
      `ALTER TABLE ONLY public.agent_commands ADD CONSTRAINT agent_commands_pkey PRIMARY KEY (seq)`,
    );
    await queryRunner.query(
      `ALTER TABLE ONLY public.agent_configs ADD CONSTRAINT agent_configs_pkey PRIMARY KEY (agent_id, worker, key)`,
    );
    await queryRunner.query(
      `ALTER TABLE ONLY public.agent_events ADD CONSTRAINT agent_events_pkey PRIMARY KEY (agent_id, id)`,
    );
    await queryRunner.query(
      `ALTER TABLE ONLY public.agent_issues ADD CONSTRAINT agent_issues_pkey PRIMARY KEY (id)`,
    );
    await queryRunner.query(
      `ALTER TABLE ONLY public.agent_metrics ADD CONSTRAINT agent_metrics_pkey PRIMARY KEY (id)`,
    );
    await queryRunner.query(
      `ALTER TABLE ONLY public.agents ADD CONSTRAINT agents_pkey PRIMARY KEY (id)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENTS_ENROLLED" ON public.agents USING btree (enrolled_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENT_COMMANDS_AGENT_PENDING" ON public.agent_commands USING btree (agent_id, status, seq)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENT_COMMANDS_FINISHED" ON public.agent_commands USING btree (finished_at)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_AGENT_COMMANDS_ID" ON public.agent_commands USING btree (id)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENT_ENROLLMENT_TOKENS_CREATED" ON public.agent_enrollment_tokens USING btree (created_at)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_AGENT_ENROLLMENT_TOKENS_PREFIX" ON public.agent_enrollment_tokens USING btree (prefix)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENT_EVENTS_AGENT" ON public.agent_events USING btree (agent_id, received_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENT_EVENTS_RECEIVED" ON public.agent_events USING btree (received_at, id)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENT_METRICS_AGENT_AT" ON public.agent_metrics USING btree (agent_id, at)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_JOB_RUNS_AGENT_STATUS" ON public.job_runs USING btree (agent_id, status)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_JOB_RUNS_EXTERNAL" ON public.job_runs USING btree (agent_id, external_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_JOB_RUNS_OWNER_CREATED" ON public.job_runs USING btree (owner_id, created_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_JOB_RUNS_SCOPE_CREATED" ON public.job_runs USING btree (scope_type, scope_id, created_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_JOB_RUNS_STATUS_DEADLINE" ON public.job_runs USING btree (status, deadline_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_JOB_RUNS_STATUS_LEASE" ON public.job_runs USING btree (status, lease_until)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_NODES_AGENT" ON public.nodes USING btree (agent_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_NODES_CREATED" ON public.nodes USING btree (created_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_NODES_CREATED_BY" ON public.nodes USING btree (created_by_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_NODES_OWNER" ON public.nodes USING btree (owner_id)`,
    );
    await queryRunner.query(
      `ALTER TABLE ONLY public.nodes ADD CONSTRAINT "FK_a89d88c788ce2a9e77bcda210f4" FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE ONLY public.nodes ADD CONSTRAINT "FK_d4868212c17eb662863b5cdffbe" FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE SET NULL`,
    );
  }
}
