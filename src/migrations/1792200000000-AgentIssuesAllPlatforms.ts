import { MigrationInterface, QueryRunner } from "typeorm";

/** Архив агента один на все платформы: у одноразовой ссылки платформы больше нет. */
export class AgentIssuesAllPlatforms1792200000000 implements MigrationInterface {
  name = "AgentIssuesAllPlatforms1792200000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "agent_issues" DROP COLUMN "platform"`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agent_issues" ADD "platform" varchar(16) NOT NULL DEFAULT 'linux-amd64'`,
    );
  }
}
