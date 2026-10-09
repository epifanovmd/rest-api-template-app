import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Внешние задачи: тип задачи воркера (`job_runs.job_type`) и файлы итога
 * (`job_runs.outputs` — имя выхода, ключ хранилища, размер).
 */
export class JobRunOutputs1791700000000 implements MigrationInterface {
  name = "JobRunOutputs1791700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "job_runs" ADD "job_type" character varying(64)`,
    );
    await queryRunner.query(`ALTER TABLE "job_runs" ADD "outputs" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "job_runs" DROP COLUMN "outputs"`);
    await queryRunner.query(`ALTER TABLE "job_runs" DROP COLUMN "job_type"`);
  }
}
