export interface BasePageResult<T> {
  count?: number;
  page?: number;
  limit?: number;
  data: T;
}
