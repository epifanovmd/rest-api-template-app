export const BOOTSTRAP = Symbol("Bootstrap");

export interface IBootstrap {
  initialize(): Promise<void>;
  destroy?(): Promise<void>;
}
