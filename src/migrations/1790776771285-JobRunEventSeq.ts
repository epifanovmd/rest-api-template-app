import { MigrationInterface, QueryRunner } from "typeorm";

export class JobRunEventSeq1790776771285 implements MigrationInterface {
    name = 'JobRunEventSeq1790776771285'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "job_runs" ADD "event_seq" integer NOT NULL DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "job_runs" DROP COLUMN "event_seq"`);
    }

}
