import { MigrationInterface, QueryRunner } from "typeorm";

export class Workspaces1790355361639 implements MigrationInterface {
    name = 'Workspaces1790355361639'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "workspaces" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying(100) NOT NULL, "slug" character varying(64) NOT NULL, "owner_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "archived_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_098656ae401f3e1a4586f47fd8e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_WORKSPACES_OWNER" ON "workspaces"  ("owner_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_WORKSPACES_SLUG" ON "workspaces"  ("slug") `);
        await queryRunner.query(`CREATE TABLE "workspace_members" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "workspace_id" uuid NOT NULL, "user_id" uuid NOT NULL, "role" character varying(16) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_22ab43ac5865cd62769121d2bc4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_WORKSPACE_MEMBERS_WORKSPACE_ROLE" ON "workspace_members"  ("workspace_id", "role") `);
        await queryRunner.query(`CREATE INDEX "IDX_WORKSPACE_MEMBERS_USER" ON "workspace_members"  ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_WORKSPACE_MEMBERS_WORKSPACE_USER" ON "workspace_members"  ("workspace_id", "user_id") `);
        await queryRunner.query(`CREATE TABLE "workspace_invites" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "workspace_id" uuid NOT NULL, "email" character varying(50) NOT NULL, "role" character varying(16) NOT NULL, "token_hash" character varying(64) NOT NULL, "invited_by" uuid, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "accepted_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_43f7a0e0b0549fe2581e9cb57bc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_WORKSPACE_INVITES_WORKSPACE_EMAIL" ON "workspace_invites"  ("workspace_id", "email") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_WORKSPACE_INVITES_TOKEN_HASH" ON "workspace_invites"  ("token_hash") `);
        await queryRunner.query(`ALTER TABLE "workspaces" ADD CONSTRAINT "FK_3bc45ecdd8fdc2108bb92516dde" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "workspace_members" ADD CONSTRAINT "FK_4a7c584ddfe855379598b5e20fd" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "workspace_members" ADD CONSTRAINT "FK_4e83431119fa585fc7aa8b817db" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "workspace_invites" ADD CONSTRAINT "FK_9ffc4e5b893e8fb91d66d466f6d" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "workspace_invites" ADD CONSTRAINT "FK_cf390e54ae1d8871cb74aad9c89" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "workspace_invites" DROP CONSTRAINT "FK_cf390e54ae1d8871cb74aad9c89"`);
        await queryRunner.query(`ALTER TABLE "workspace_invites" DROP CONSTRAINT "FK_9ffc4e5b893e8fb91d66d466f6d"`);
        await queryRunner.query(`ALTER TABLE "workspace_members" DROP CONSTRAINT "FK_4e83431119fa585fc7aa8b817db"`);
        await queryRunner.query(`ALTER TABLE "workspace_members" DROP CONSTRAINT "FK_4a7c584ddfe855379598b5e20fd"`);
        await queryRunner.query(`ALTER TABLE "workspaces" DROP CONSTRAINT "FK_3bc45ecdd8fdc2108bb92516dde"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_WORKSPACE_INVITES_TOKEN_HASH"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_WORKSPACE_INVITES_WORKSPACE_EMAIL"`);
        await queryRunner.query(`DROP TABLE "workspace_invites"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_WORKSPACE_MEMBERS_WORKSPACE_USER"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_WORKSPACE_MEMBERS_USER"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_WORKSPACE_MEMBERS_WORKSPACE_ROLE"`);
        await queryRunner.query(`DROP TABLE "workspace_members"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_WORKSPACES_SLUG"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_WORKSPACES_OWNER"`);
        await queryRunner.query(`DROP TABLE "workspaces"`);
    }

}
