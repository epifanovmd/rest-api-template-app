import { WgOverviewStatsPayload } from "../../socket/socket.types";

export class WgOverviewStatsUpdatedEvent {
  static readonly eventName = "wg.overview.stats.updated" as const;

  constructor(public readonly overview: WgOverviewStatsPayload) {}
}
