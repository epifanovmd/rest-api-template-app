import { EChatMemberRole } from "../chat.types";

export interface ICreateDirectChatBody {
  targetUserId: string;
}

export interface ICreateGroupChatBody {
  name: string;
  memberIds: string[];
  avatarId?: string;
}

export interface IUpdateChatBody {
  name?: string;
  avatarId?: string | null;
}

export interface IAddMembersBody {
  memberIds: string[];
}

export interface IMuteChatBody {
  mutedUntil: string | null;
}

export interface ICreateChannelBody {
  name: string;
  description?: string;
  username?: string;
  avatarId?: string;
  isPublic?: boolean;
}

export interface IUpdateChannelBody {
  name?: string;
  description?: string | null;
  username?: string | null;
  avatarId?: string | null;
  isPublic?: boolean;
}

export interface ICreateInviteBody {
  expiresAt?: string;
  maxUses?: number;
}

export interface IUpdateMemberRoleBody {
  role: EChatMemberRole;
}

export interface ICreateFolderBody {
  name: string;
}

export interface IUpdateFolderBody {
  name?: string;
  position?: number;
}

export interface IMoveChatToFolderBody {
  folderId: string | null;
}
