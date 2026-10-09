import { expect } from "chai";

import {
  CreateNodeSchema,
  InstallNodeAgentSchema,
  NodesQuerySchema,
  UninstallNodeAgentSchema,
  UpdateNodeSchema,
} from "./node.validate";

describe("схемы узлов", () => {
  it("создание: название обязательно, адрес — имя хоста или IP без схемы", () => {
    expect(CreateNodeSchema.safeParse({ name: " " }).success).to.equal(false);
    expect(
      CreateNodeSchema.safeParse({ name: "a", host: "node-1.example.com" })
        .success,
    ).to.equal(true);
    expect(
      CreateNodeSchema.safeParse({ name: "a", host: "2001:db8::1" }).success,
    ).to.equal(true);
    expect(
      CreateNodeSchema.safeParse({ name: "a", host: "http://x" }).success,
    ).to.equal(false);
    expect(
      CreateNodeSchema.safeParse({ name: "a", host: "a b" }).success,
    ).to.equal(false);
  });

  it("изменение: хотя бы одно поле", () => {
    expect(UpdateNodeSchema.safeParse({}).success).to.equal(false);
    expect(UpdateNodeSchema.safeParse({ host: null }).success).to.equal(true);
  });

  it("SSH: нужен пароль или ключ; порт и пользователь — по правилам", () => {
    expect(InstallNodeAgentSchema.safeParse({}).success).to.equal(false);
    expect(
      InstallNodeAgentSchema.safeParse({ password: "p", port: 2222 }).success,
    ).to.equal(true);
    expect(
      InstallNodeAgentSchema.safeParse({ password: "p", port: 70000 }).success,
    ).to.equal(false);
    expect(
      InstallNodeAgentSchema.safeParse({ privateKey: "k", username: "a;b" })
        .success,
    ).to.equal(false);
    expect(
      InstallNodeAgentSchema.safeParse({
        password: "p",
        backendUrl: "ftp://x",
      }).success,
    ).to.equal(false);
    expect(
      UninstallNodeAgentSchema.safeParse({ privateKey: "k", purge: true })
        .success,
    ).to.equal(true);
  });

  it("список: mine строкой из query", () => {
    expect(NodesQuerySchema.parse({ mine: "true", limit: "5" })).to.deep.equal({
      mine: "true",
      limit: 5,
    });
    expect(NodesQuerySchema.safeParse({ mine: "yes" }).success).to.equal(false);
  });
});
