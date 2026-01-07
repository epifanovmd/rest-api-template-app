export interface IMessagesRequestDto {
  dialogId: string;
  text: string;
  system?: boolean;
  received?: boolean;
  replyId?: string | null;
  imageIds?: string[];
  videoIds?: string[];
  audioIds?: string[];
}
