export interface IFileDto {
  id: string;
  name: string;
  type: string;
  url: string;
  size: number;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  createdAt: Date;
  updatedAt: Date;
}
