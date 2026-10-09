import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Имя агента узла (`nodes.agent_name`): остаётся у узла и без агента — агент,
 * зарегистрированный заново без метки узла, находит по нему свой узел.
 * Заполняется именами привязанных сейчас агентов. Штатная остановка внешних
 * задач (`job_runs.stop_requested`) убрана: задачи воркеров её не знают —
 * только отмена.
 */
export class NodeAgentName1791600000000 implements MigrationInterface {
  name = "NodeAgentName1791600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "nodes" ADD "agent_name" character varying(128)`,
    );
    await queryRunner.query(
      `UPDATE "nodes" SET "agent_name" = "agents"."name" FROM "agents" WHERE "agents"."id" = "nodes"."agent_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_runs" DROP COLUMN "stop_requested"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "job_runs" ADD "stop_requested" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`ALTER TABLE "nodes" DROP COLUMN "agent_name"`);
  }
}
