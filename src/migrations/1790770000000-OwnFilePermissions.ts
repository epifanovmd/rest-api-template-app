import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Файлы перешли на права с областью: свои файлы видит и удаляет пользователь
 * с `file:view:own` / `file:delete:own`. Раньше это мог любой вошедший, поэтому
 * права получают все роли (кроме имеющих `*`) и пользователи без ролей —
 * доступ не меняется. API-ключей не касается: маршруты файлов — только jwt.
 */
const OWN_FILES = ["file:view:own", "file:delete:own"];

export class OwnFilePermissions1790770000000 implements MigrationInterface {
  name = "OwnFilePermissions1790770000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "permissions" ("name") SELECT unnest($1::varchar[]) ON CONFLICT ("name") DO NOTHING`,
      [OWN_FILES],
    );
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id", "permission_id")
       SELECT role."id", target."id"
       FROM "roles" role
       JOIN "permissions" target ON target."name" = ANY($1::varchar[])
       WHERE NOT EXISTS (
         SELECT 1 FROM "role_permissions" link
         JOIN "permissions" source ON source."id" = link."permission_id"
         WHERE link."role_id" = role."id" AND source."name" = '*'
       )
       ON CONFLICT DO NOTHING`,
      [OWN_FILES],
    );
    await queryRunner.query(
      `INSERT INTO "user_permissions" ("user_id", "permission_id")
       SELECT "user"."id", target."id"
       FROM "users" "user"
       JOIN "permissions" target ON target."name" = ANY($1::varchar[])
       WHERE NOT EXISTS (
         SELECT 1 FROM "user_roles" link WHERE link."user_id" = "user"."id"
       )
       ON CONFLICT DO NOTHING`,
      [OWN_FILES],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "name" = ANY($1::varchar[])`,
      [OWN_FILES],
    );
  }
}
