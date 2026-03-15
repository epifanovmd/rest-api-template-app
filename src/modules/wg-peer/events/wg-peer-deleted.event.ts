export class WgPeerDeletedEvent {
  static readonly eventName = "wg.peer.deleted" as const;

  constructor(
    public readonly peerId: string,
    public readonly serverId: string,
    public readonly publicKey: string,
  ) {}
}
