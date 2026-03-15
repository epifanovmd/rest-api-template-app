export enum EPermissions {
  // General
  READ = "read",
  WRITE = "write",
  DELETE = "delete",

  // WireGuard servers
  WG_SERVER_VIEW = "wg:server:view",
  WG_SERVER_MANAGE = "wg:server:manage",
  WG_SERVER_CONTROL = "wg:server:control",

  // WireGuard peers
  WG_PEER_VIEW = "wg:peer:view",
  WG_PEER_MANAGE = "wg:peer:manage",
  WG_PEER_OWN = "wg:peer:own",

  // Statistics
  WG_STATS_VIEW = "wg:stats:view",
  WG_STATS_EXPORT = "wg:stats:export",
}
