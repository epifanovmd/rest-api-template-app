interface IGenId {
  (): number;
}

export const genId: IGenId = () =>
  Number(
    Math.floor(Number(Math.random().toString(8)) * 10000).toString() +
      Math.floor(Number(Math.random().toString(10)) * 10000).toString(),
  );
