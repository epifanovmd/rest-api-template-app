import { DataSource } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository";
import { WgServer } from "./wg-server.entity";

@InjectableRepository(WgServer)
export class WgServerRepository extends BaseRepository<WgServer> {
  constructor(dataSource: DataSource) {
    super(dataSource, WgServer);
  }

  findByInterface(interfaceName: string): Promise<WgServer | null> {
    return this.findOne({ where: { interface: interfaceName } });
  }

  findAllEnabled(): Promise<WgServer[]> {
    return this.find({ where: { enabled: true } });
  }
}
