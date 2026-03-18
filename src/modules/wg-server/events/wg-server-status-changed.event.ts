import { EWgServerStatus } from "../wg-server.types";

export class WgServerStatusChangedEvent {
  static readonly eventName = "wg.server.status.changed" as const;

  constructor(
    public readonly serverId: string,
    public readonly status: EWgServerStatus,
  ) {}
}
