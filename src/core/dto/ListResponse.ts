export interface IListResponseDto<T> {
  count?: number;
  totalCount?: number;
  offset?: number;
  limit?: number;
  data: T;
}
