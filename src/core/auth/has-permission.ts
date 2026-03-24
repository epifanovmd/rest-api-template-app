import { EPermissions } from "../../modules/permission/permission.types";

/**
 * Проверяет, удовлетворяет ли набор разрешений пользователя требуемому разрешению,
 * включая разрешение wildcards.
 *
 * Примеры:
 *   hasPermission(["wg:*"], "wg:server:view")   → true
 *   hasPermission(["wg:server:*"], "wg:server:view") → true
 *   hasPermission(["wg:peer:*"], "wg:server:view")   → false
 *   hasPermission(["*"], "anything")             → true
 */
export function hasPermission(userPerms: string[], required: string): boolean {
  if (userPerms.includes(EPermissions.ALL)) return true;
  if (userPerms.includes(required)) return true;

  const parts = required.split(":");

  // eslint-disable-next-line no-plusplus
  for (let i = parts.length - 1; i >= 1; i--) {
    const wildcard = `${parts.slice(0, i).join(":")}:*`;

    if (userPerms.includes(wildcard)) return true;
  }

  return false;
}
