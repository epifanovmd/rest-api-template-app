import { OwnedAccess } from "../../core";
import type { Node } from "./node.entity";

/** Свой узел — где пользователь назначенный владелец или создатель. */
export const NodeAccess = new OwnedAccess<Node>({
  owner: "ownerId",
  creator: "createdById",
});
