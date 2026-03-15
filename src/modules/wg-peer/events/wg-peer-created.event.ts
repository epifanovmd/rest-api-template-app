export class WgPeerCreatedEvent {
  static readonly eventName = "wg.peer.created" as const;

  constructor(
    public readonly peerId: string,
    public readonly serverId: string,
    public readonly publicKey: string,
  ) {}
}
