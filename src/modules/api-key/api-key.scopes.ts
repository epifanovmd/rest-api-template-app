import { hasPermission } from "../../core";

/**
 * Scopes ключа покрывают требуемый: точное совпадение, wildcard
 * (`reports:*`, `*`) или — для требования без действия (`reports`) — любой
 * scope этого домена (`reports:export`). Конкретное действие проверяет
 * сервис по `reports:<действие>`.
 */
export const scopeSatisfied = (granted: string[], required: string): boolean =>
  hasPermission(granted, required) ||
  granted.some(scope => scope.startsWith(`${required}:`));
