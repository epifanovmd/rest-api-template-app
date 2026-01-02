import "reflect-metadata";
import "./modules/modules.associations";

import { decorate, injectable } from "inversify";
import { Controller } from "tsoa";

import { container } from "./core";

decorate(injectable(), Controller);

export const iocContainer = container;
