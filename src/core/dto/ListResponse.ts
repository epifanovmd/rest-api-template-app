export interface IListResponseDto<T> {
  count?: number;
  offset?: number;
  limit?: number;
  data: T;
}
