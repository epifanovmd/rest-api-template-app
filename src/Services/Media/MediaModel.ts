import { DataTypes, Model } from "sequelize";
import { sequelize } from "../../db/db";

export interface IMediaDto extends IMediaModel {}

export interface IMediaRequest extends Omit<IMediaDto, "id"> {}

export interface IMediaModel extends Omit<Media, keyof Model> {}

export class Media extends Model {
  id: number;
  name: string;
  url: string;
  type: string;
  size: number;

  // timestamps!
  private readonly createdAt: Date | string;
  private readonly updatedAt: Date | string;
}

Media.init(
  {
    id: {
      type: DataTypes.INTEGER(),
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(255),
    },
    url: {
      type: DataTypes.STRING(120),
    },
    type: {
      type: DataTypes.STRING(40),
    },
    size: {
      type: DataTypes.INTEGER(),
    },
  },
  {
    sequelize,
    modelName: "Media",
  },
);

Media.sync({ force: false });
