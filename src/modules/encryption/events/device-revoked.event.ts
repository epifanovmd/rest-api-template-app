export class DeviceRevokedEvent {
  constructor(
    public readonly userId: string,
    public readonly deviceId: string,
  ) {}
}
