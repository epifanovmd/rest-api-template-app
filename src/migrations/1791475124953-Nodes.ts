import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Узлы: машины с агентами — название, адрес, владелец и создатель (при
 * удалении пользователя — `NULL`), агент (уникален).
 */
export class Nodes1791475124953 implements MigrationInterface {
    name = 'Nodes1791475124953'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "nodes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying(120) NOT NULL, "description" text, "host" character varying(255), "owner_id" uuid, "created_by_id" uuid, "agent_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_682d6427523a0fa43d062ea03ee" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_NODES_AGENT" ON "nodes"  ("agent_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_NODES_CREATED" ON "nodes"  ("created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_NODES_CREATED_BY" ON "nodes"  ("created_by_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_NODES_OWNER" ON "nodes"  ("owner_id") `);
        await queryRunner.query(`ALTER TABLE "nodes" ADD CONSTRAINT "FK_a89d88c788ce2a9e77bcda210f4" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "nodes" ADD CONSTRAINT "FK_d4868212c17eb662863b5cdffbe" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "nodes" DROP CONSTRAINT "FK_d4868212c17eb662863b5cdffbe"`);
        await queryRunner.query(`ALTER TABLE "nodes" DROP CONSTRAINT "FK_a89d88c788ce2a9e77bcda210f4"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_NODES_OWNER"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_NODES_CREATED_BY"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_NODES_CREATED"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_NODES_AGENT"`);
        await queryRunner.query(`DROP TABLE "nodes"`);
    }

}
