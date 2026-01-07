export interface IDialogFindRequestDto {
  recipientId: string[];
}

export interface IDialogFindResponseDto {
  dialogId: string | null;
}

export interface IDialogFindOrCreateResponseDto {
  dialogId: string;
}
