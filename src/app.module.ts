import "reflect-metadata";

import { decorate, injectable } from "inversify";
import { Controller } from "tsoa";

import { container } from "./decorators/container";

decorate(injectable(), Controller);

export const iocContainer = container;
