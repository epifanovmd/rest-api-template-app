import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Удалённый агент остаётся отозванной записью (`deleted_at`): его история удалена, а агент со
 * старым ключом получает `403 AGENT_REVOKED`, а не регистрируется заново.
 */
export class AgentDeleted1792000000000 implements MigrationInterface {
  name = "AgentDeleted1792000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "agents" ADD "deleted_at" timestamptz`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "agents" DROP COLUMN "deleted_at"`);
  }
}
