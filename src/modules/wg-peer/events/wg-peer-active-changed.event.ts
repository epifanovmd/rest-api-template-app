export class WgPeerActiveChangedEvent {
  static readonly eventName = "wg.peer.active.changed" as const;

  constructor(
    public readonly peerId: string,
    public readonly serverId: string,
    public readonly publicKey: string,
    public readonly isActive: boolean,
    public readonly lastHandshake: Date | null,
    public readonly endpoint: string | null,
  ) {}
}
