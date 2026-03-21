export enum EPermissions {
  // ── Superadmin ────────────────────────────────────────────────────────────
  /** Grants access to everything. Equivalent to being ADMIN. */
  ALL = "*",

  // ── WireGuard wildcards ───────────────────────────────────────────────────
  /** All WireGuard permissions */
  WG_ALL = "wg:*",
  /** All WireGuard server permissions */
  WG_SERVER_ALL = "wg:server:*",
  /** All WireGuard peer permissions */
  WG_PEER_ALL = "wg:peer:*",
  /** All WireGuard statistics permissions */
  WG_STATS_ALL = "wg:stats:*",

  // ── WireGuard servers ─────────────────────────────────────────────────────
  WG_SERVER_VIEW = "wg:server:view",
  WG_SERVER_MANAGE = "wg:server:manage",
  WG_SERVER_CONTROL = "wg:server:control",

  // ── WireGuard peers ───────────────────────────────────────────────────────
  WG_PEER_VIEW = "wg:peer:view",
  WG_PEER_MANAGE = "wg:peer:manage",
  /** User can only access peers assigned to them */
  WG_PEER_OWN = "wg:peer:own",

  // ── WireGuard statistics ──────────────────────────────────────────────────
  WG_STATS_VIEW = "wg:stats:view",
  WG_STATS_EXPORT = "wg:stats:export",

  // ── User management ───────────────────────────────────────────────────────
  USER_VIEW = "user:view",
  USER_MANAGE = "user:manage",

  // ── Generic (kept for backwards-compat / simple projects) ─────────────────
  READ = "read",
  WRITE = "write",
  DELETE = "delete",
}
