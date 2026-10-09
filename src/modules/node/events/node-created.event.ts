/** Узел создан (вручную или регистрацией агента). */
export class NodeCreatedEvent {
  constructor(public readonly nodeId: string) {}
}
