import { EWgServerStatus } from "../../wg-server/wg-server.types";

export class WgPeerStatusChangedEvent {
  static readonly eventName = "wg.peer.status.changed" as const;

  constructor(
    public readonly peerId: string,
    public readonly serverId: string,
    public readonly status: EWgServerStatus,
  ) {}
}
