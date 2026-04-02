export interface IFileDto {
  id: string;
  name: string;
  type: string;
  url: string;
  size: number;
  thumbnailUrl: string | null;
  mediumUrl: string | null;
  blurhash: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  waveform: number[] | null;
  createdAt: Date;
  updatedAt: Date;
}
