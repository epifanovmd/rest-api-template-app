export class FileUploadedEvent {
  constructor(
    public readonly fileId: string,
    public readonly userId: string,
    public readonly type: string,
  ) {}
}
