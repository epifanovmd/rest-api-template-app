import { signedUrlOf, type TFileRef, type TSignedFiles } from "../../file";
import { EMessageStatus } from "../message.types";
import { MessageReceipt } from "../message-receipt.entity";

/** Аватары прочитавших — для подписи пачкой перед сборкой `MessageReceiptDto`. */
export const collectReceiptFiles = (
  receipts: ReadonlyArray<MessageReceipt>,
): TFileRef[] => receipts.map(receipt => receipt.user?.profile?.avatar);

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

  constructor(receipt: MessageReceipt, files: TSignedFiles) {
    this.userId = receipt.userId;
    this.status = receipt.status;
    this.updatedAt = receipt.updatedAt;
    this.user = receipt.user
      ? {
          id: receipt.user.id,
          firstName: receipt.user.profile?.firstName,
          lastName: receipt.user.profile?.lastName,
          avatarUrl: signedUrlOf(receipt.user.profile?.avatar, files),
        }
      : undefined;
  }

  static fromEntity(receipt: MessageReceipt, files: TSignedFiles) {
    return new MessageReceiptDto(receipt, files);
  }
}
