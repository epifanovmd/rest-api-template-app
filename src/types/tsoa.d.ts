import { SecurityScopes } from "../common";

declare module "tsoa" {
  export function Security(name: "jwt", scopes?: SecurityScopes): Function;
}
