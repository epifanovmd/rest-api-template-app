import {
  type Agent,
  AgentsError,
  schemaProblems,
  type SchemaTarget,
} from "agent-sdk/server";

import { logger } from "../../core";

/**
 * Замечания к `data` по схеме из манифеста воркера («поле: замечание», не
 * больше трёх); пусто — подходит или проверять нечем. Схему нельзя применить —
 * без проверки, с записью в журнал.
 */
export const schemaProblemsOf = (
  agent: Pick<Agent, "id" | "workers">,
  worker: string,
  target: SchemaTarget,
  data: unknown,
): string[] => {
  try {
    return schemaProblems(agent, worker, target, data);
  } catch (err) {
    logger.warn(
      { err, agentId: agent.id, worker, target },
      "[Agent] Схема из манифеста воркера не применяется",
    );

    return [];
  }
};

/** Значение ключа настроек по схеме ключа из манифеста; нет — `CONFIG_INVALID` (400). */
export const requireValidConfig = (
  agent: Pick<Agent, "id" | "workers">,
  worker: string,
  key: string,
  data: unknown,
): void => {
  const problems = schemaProblemsOf(agent, worker, { config: key }, data);

  if (problems.length) {
    throw new AgentsError(
      "CONFIG_INVALID",
      `${worker}/${key}: ${problems.join("; ")}`,
      400,
    );
  }
};

/** Тело запроса к воркеру: разобранный JSON; не JSON — текст как есть. */
const bodyValue = (body: string | Uint8Array | undefined): unknown => {
  if (body === undefined) return null;
  const text =
    typeof body === "string" ? body : Buffer.from(body).toString("utf8");

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

/**
 * Тело запроса к воркеру по схеме маршрута из манифеста (`routes[].request`):
 * не по схеме — `REQUEST_INVALID` (400). Маршрут без схемы не проверяется.
 */
export const requireValidRequest = (
  agent: Pick<Agent, "id" | "workers">,
  worker: string,
  method: string,
  path: string,
  body: string | Uint8Array | undefined,
): void => {
  const problems = schemaProblemsOf(
    agent,
    worker,
    { route: { method, path } },
    bodyValue(body),
  );

  if (problems.length) {
    throw new AgentsError(
      "REQUEST_INVALID",
      `${worker} ${method} ${path.split("?")[0]}: ${problems.join("; ")}`,
      400,
    );
  }
};
