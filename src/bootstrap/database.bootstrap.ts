import { inject, injectable } from "inversify";
import { DataSource } from "typeorm";

import { IBootstrap } from "../core";

@injectable()
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
