import { MigrationInterface, QueryRunner } from "typeorm";

export class ServerAndPeerSetNullForStatistic1774192800174 implements MigrationInterface {
    name = "ServerAndPeerSetNullForStatistic1774192800174";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"wg_traffic_stats\" DROP CONSTRAINT \"FK_b2fdc3b29e03ddd0687cb9ad643\"");
        await queryRunner.query("ALTER TABLE \"wg_traffic_stats\" DROP CONSTRAINT \"FK_b810887aeb87fa6fc67f5ef9504\"");
        await queryRunner.query("ALTER TABLE \"wg_speed_samples\" DROP CONSTRAINT \"FK_2a4aac6d2782ef4cb7634b3d9e5\"");
        await queryRunner.query("ALTER TABLE \"wg_speed_samples\" DROP CONSTRAINT \"FK_d40496308d298d817c5037a49b7\"");
        await queryRunner.query("DROP INDEX \"public\".\"IDX_WG_TRAFFIC_STAT_PEER_TS\"");
        await queryRunner.query("DROP INDEX \"public\".\"IDX_WG_TRAFFIC_STAT_SERVER_TS\"");
        await queryRunner.query("ALTER TABLE \"wg_traffic_stats\" ALTER COLUMN \"peer_id\" DROP NOT NULL");
        await queryRunner.query("ALTER TABLE \"wg_traffic_stats\" ALTER COLUMN \"server_id\" DROP NOT NULL");
        await queryRunner.query("DROP INDEX \"public\".\"IDX_WG_SPEED_PEER_TS\"");
        await queryRunner.query("DROP INDEX \"public\".\"IDX_WG_SPEED_SERVER_TS\"");
        await queryRunner.query("ALTER TABLE \"wg_speed_samples\" ALTER COLUMN \"peer_id\" DROP NOT NULL");
        await queryRunner.query("ALTER TABLE \"wg_speed_samples\" ALTER COLUMN \"server_id\" DROP NOT NULL");
        await queryRunner.query("CREATE INDEX \"IDX_WG_TRAFFIC_STAT_SERVER_TS\" ON \"wg_traffic_stats\" (\"server_id\", \"timestamp\") ");
        await queryRunner.query("CREATE INDEX \"IDX_WG_TRAFFIC_STAT_PEER_TS\" ON \"wg_traffic_stats\" (\"peer_id\", \"timestamp\") ");
        await queryRunner.query("CREATE INDEX \"IDX_WG_SPEED_SERVER_TS\" ON \"wg_speed_samples\" (\"server_id\", \"timestamp\") ");
        await queryRunner.query("CREATE INDEX \"IDX_WG_SPEED_PEER_TS\" ON \"wg_speed_samples\" (\"peer_id\", \"timestamp\") ");
        await queryRunner.query("ALTER TABLE \"wg_traffic_stats\" ADD CONSTRAINT \"FK_b2fdc3b29e03ddd0687cb9ad643\" FOREIGN KEY (\"peer_id\") REFERENCES \"wg_peers\"(\"id\") ON DELETE SET NULL ON UPDATE NO ACTION");
        await queryRunner.query("ALTER TABLE \"wg_traffic_stats\" ADD CONSTRAINT \"FK_b810887aeb87fa6fc67f5ef9504\" FOREIGN KEY (\"server_id\") REFERENCES \"wg_servers\"(\"id\") ON DELETE SET NULL ON UPDATE NO ACTION");
        await queryRunner.query("ALTER TABLE \"wg_speed_samples\" ADD CONSTRAINT \"FK_2a4aac6d2782ef4cb7634b3d9e5\" FOREIGN KEY (\"peer_id\") REFERENCES \"wg_peers\"(\"id\") ON DELETE SET NULL ON UPDATE NO ACTION");
        await queryRunner.query("ALTER TABLE \"wg_speed_samples\" ADD CONSTRAINT \"FK_d40496308d298d817c5037a49b7\" FOREIGN KEY (\"server_id\") REFERENCES \"wg_servers\"(\"id\") ON DELETE SET NULL ON UPDATE NO ACTION");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query("ALTER TABLE \"wg_speed_samples\" DROP CONSTRAINT \"FK_d40496308d298d817c5037a49b7\"");
        await queryRunner.query("ALTER TABLE \"wg_speed_samples\" DROP CONSTRAINT \"FK_2a4aac6d2782ef4cb7634b3d9e5\"");
        await queryRunner.query("ALTER TABLE \"wg_traffic_stats\" DROP CONSTRAINT \"FK_b810887aeb87fa6fc67f5ef9504\"");
        await queryRunner.query("ALTER TABLE \"wg_traffic_stats\" DROP CONSTRAINT \"FK_b2fdc3b29e03ddd0687cb9ad643\"");
        await queryRunner.query("DROP INDEX \"public\".\"IDX_WG_SPEED_PEER_TS\"");
        await queryRunner.query("DROP INDEX \"public\".\"IDX_WG_SPEED_SERVER_TS\"");
        await queryRunner.query("DROP INDEX \"public\".\"IDX_WG_TRAFFIC_STAT_PEER_TS\"");
        await queryRunner.query("DROP INDEX \"public\".\"IDX_WG_TRAFFIC_STAT_SERVER_TS\"");
        await queryRunner.query("ALTER TABLE \"wg_speed_samples\" ALTER COLUMN \"server_id\" SET NOT NULL");
        await queryRunner.query("ALTER TABLE \"wg_speed_samples\" ALTER COLUMN \"peer_id\" SET NOT NULL");
        await queryRunner.query("CREATE INDEX \"IDX_WG_SPEED_SERVER_TS\" ON \"wg_speed_samples\" (\"server_id\", \"timestamp\") ");
        await queryRunner.query("CREATE INDEX \"IDX_WG_SPEED_PEER_TS\" ON \"wg_speed_samples\" (\"peer_id\", \"timestamp\") ");
        await queryRunner.query("ALTER TABLE \"wg_traffic_stats\" ALTER COLUMN \"server_id\" SET NOT NULL");
        await queryRunner.query("ALTER TABLE \"wg_traffic_stats\" ALTER COLUMN \"peer_id\" SET NOT NULL");
        await queryRunner.query("CREATE INDEX \"IDX_WG_TRAFFIC_STAT_SERVER_TS\" ON \"wg_traffic_stats\" (\"server_id\", \"timestamp\") ");
        await queryRunner.query("CREATE INDEX \"IDX_WG_TRAFFIC_STAT_PEER_TS\" ON \"wg_traffic_stats\" (\"peer_id\", \"timestamp\") ");
        await queryRunner.query("ALTER TABLE \"wg_speed_samples\" ADD CONSTRAINT \"FK_d40496308d298d817c5037a49b7\" FOREIGN KEY (\"server_id\") REFERENCES \"wg_servers\"(\"id\") ON DELETE CASCADE ON UPDATE NO ACTION");
        await queryRunner.query("ALTER TABLE \"wg_speed_samples\" ADD CONSTRAINT \"FK_2a4aac6d2782ef4cb7634b3d9e5\" FOREIGN KEY (\"peer_id\") REFERENCES \"wg_peers\"(\"id\") ON DELETE CASCADE ON UPDATE NO ACTION");
        await queryRunner.query("ALTER TABLE \"wg_traffic_stats\" ADD CONSTRAINT \"FK_b810887aeb87fa6fc67f5ef9504\" FOREIGN KEY (\"server_id\") REFERENCES \"wg_servers\"(\"id\") ON DELETE CASCADE ON UPDATE NO ACTION");
        await queryRunner.query("ALTER TABLE \"wg_traffic_stats\" ADD CONSTRAINT \"FK_b2fdc3b29e03ddd0687cb9ad643\" FOREIGN KEY (\"peer_id\") REFERENCES \"wg_peers\"(\"id\") ON DELETE CASCADE ON UPDATE NO ACTION");
    }

}
