import "reflect-metadata";

import { decorate, injectable } from "inversify";
import { Controller } from "tsoa";

decorate(injectable(), Controller);

export { iocContainer } from "@force-dev/utils";
