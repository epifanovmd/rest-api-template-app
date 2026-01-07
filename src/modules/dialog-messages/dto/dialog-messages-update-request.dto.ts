export interface IMessagesUpdateRequestDto {
  text?: string;
  system?: boolean;
  received?: boolean;
  replyId?: string | null;
  imageIds?: string[];
  videoIds?: string[];
  audioIds?: string[];
  deleteFileIds?: string[];
}
