import "reflect-metadata";
import "./modules/modules.associations";

import { decorate, injectable } from "inversify";
import { Controller } from "tsoa";

decorate(injectable(), Controller);

export { iocContainer } from "@force-dev/utils";
