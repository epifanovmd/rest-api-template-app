/** Нагрузка узла: последняя точка метрик узла его агента (без метрик воркеров). */
export interface INodeLoadDto {
  nodeId: string;
  agentId: string;
  point: {
    /** Время сбора на узле, мс. */
    at: number;
    /** Метрики узла: процессор, память, диски, средняя нагрузка. */
    host?: Record<string, unknown>;
  };
}
