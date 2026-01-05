export interface IApiResponse<T = unknown> {
  message?: string;
  data?: T;
}

export class IApiResponseDto<T = unknown> implements IApiResponse {
  public message?: string = undefined;
  public data?: T = undefined;

  constructor(value: IApiResponse<T>) {
    this.message = value.message;
    this.data = value.data;
  }

  toJson() {
    return JSON.stringify({
      message: this.message,
      data: this.data,
    });
  }
}
