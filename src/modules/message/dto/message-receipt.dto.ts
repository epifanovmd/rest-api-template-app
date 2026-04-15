import { EMessageStatus } from "../message.types";

export class MessageReceiptDto {
  userId: string;
  status: EMessageStatus;
  updatedAt: Date;
  user?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    avatarUrl?: string | null;
  };
}
