import type { INodeMeshDto } from "../dto";

/** Матрица связности узлов пересчитана по новым измерениям. */
export class NodeMeshUpdatedEvent {
  constructor(public readonly mesh: INodeMeshDto) {}
}
