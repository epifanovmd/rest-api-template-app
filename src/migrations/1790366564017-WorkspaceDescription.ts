import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkspaceDescription1790366564017 implements MigrationInterface {
    name = 'WorkspaceDescription1790366564017'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "workspaces" ADD "description" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "workspaces" DROP COLUMN "description"`);
    }

}
