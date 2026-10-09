/** Узел в матрице связности. */
export interface INodeMeshNodeDto {
  id: string;
  name: string;
  host: string | null;
}

/** Связность «откуда → куда» по последнему кругу проверки воркера `netprobe`. */
export interface INodeMeshCellDto {
  /** Узел, агент которого проверял. */
  from: string;
  /** Проверяемый узел. */
  to: string;
  /** `icmp` | `tcp`. */
  method: string;
  /** Чем проверено на деле (запасной путь, если ICMP недоступен). */
  via?: string;
  sent: number;
  received: number;
  /** Доля потерянных запросов, %. */
  lossPct: number;
  /** Задержка, мс; `null` — ответов не было. */
  rttAvgMs: number | null;
  rttMinMs: number | null;
  rttMaxMs: number | null;
  /** Когда закончен круг (часы узла), мс. */
  at: number;
  /** Итог старый: агент перестал проверять или не на связи. */
  stale: boolean;
  /** Ошибка проверки (имя не разрешилось, порт закрыт …). */
  error?: string;
}

/** Матрица связности узлов. */
export interface INodeMeshDto {
  nodes: INodeMeshNodeDto[];
  cells: INodeMeshCellDto[];
  /** Когда собрана, мс. */
  generatedAt: number;
}

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
