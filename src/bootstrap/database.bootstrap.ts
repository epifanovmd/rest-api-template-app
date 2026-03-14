import { inject } from "inversify";
import { DataSource } from "typeorm";

import { IBootstrap, Injectable } from "../core";

@Injectable()
export class DatabaseBootstrap implements IBootstrap {
  constructor(@inject(DataSource) private readonly dataSource: DataSource) {}

  async initialize(): Promise<void> {
    await this.dataSource.initialize();
  }

  async destroy(): Promise<void> {
    if (this.dataSource.isInitialized) {
      await this.dataSource.destroy();
    }
  }
}
