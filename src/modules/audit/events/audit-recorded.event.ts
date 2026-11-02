import type { AuditEventDto } from "../dto/audit.dto";

/** Событие безопасности записано в журнал. */
export class AuditRecordedEvent {
  constructor(public readonly event: AuditEventDto) {}
}
