import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * События воркеров: замечания проверки `data` по схеме манифеста
 * (`agent_events.problems`; `NULL` — подошло или не проверялось).
 */
export class AgentEventProblems1791800000000 implements MigrationInterface {
  name = "AgentEventProblems1791800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "agent_events" ADD "problems" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agent_events" DROP COLUMN "problems"`,
    );
  }
}
