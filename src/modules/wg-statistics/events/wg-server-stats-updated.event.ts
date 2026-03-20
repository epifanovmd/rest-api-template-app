import { WgServerStatsPayload } from "../../socket/socket.types";

export class WgServerStatsUpdatedEvent {
  static readonly eventName = "wg.server.stats.updated" as const;

  constructor(public readonly server: WgServerStatsPayload) {}
}
