import { Container } from "inversify";

import { Module } from "../../modules";
import { FileController } from "./file.controller";
import { FileService } from "./file.service";

export class FileModule implements Module {
  Configure(ioc: Container) {
    ioc.bind(FileController).to(FileController).inSingletonScope();
    ioc.bind(FileService).to(FileService).inSingletonScope();
  }
}
