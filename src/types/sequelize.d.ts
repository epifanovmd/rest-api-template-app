// // tslint:disable
//
// declare module "sequelize" {
//   export type ModelType = typeof Model;
//   export type ModelCtor<M extends Model> = { new (): M } & ModelType;
//
//   export abstract class Model {
//     public static init<
//       M extends Model = Model,
//       T extends keyof M = any
//       >(this: ModelCtor<M>, attributes: Record<T, any>, options: any): void;
//     public static findAll<
//       M extends Model = Model,
//       K extends keyof M = any
//       >(this: { new(): M } & typeof Model, options?: FindOptions<K>): Promise<(Pick<M, K> | M)[]>;
//   }
//   export interface FindOptions<T = any> extends Projectable<T> {
//   }
//   export interface Projectable<T> {
//     attributes?: T[];
//   }
//
// }
