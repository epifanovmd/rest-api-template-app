import "reflect-metadata";

import { expect } from "chai";

import { type IFileDto, NO_SIGNED_FILES } from "../../file";
import { collectUserFiles, PublicUserDto, UserDto } from "./user.dto";

const createUserEntity = (overrides: Record<string, any> = {}) =>
  ({
    id: "user-1",
    email: "test@example.com",
    emailVerified: true,
    phone: "+1234567890",
    username: "testuser",
    profile: null,
    roles: [],
    directPermissions: [],
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-02"),
    ...overrides,
  }) as any;

describe("UserDto", () => {
  it("basic fields mapped correctly", () => {
    const entity = createUserEntity();
    const dto = UserDto.fromEntity(entity);

    expect(dto.id).to.equal("user-1");
    expect(dto.email).to.equal("test@example.com");
    expect(dto.emailVerified).to.be.true;
    expect(dto.phone).to.equal("+1234567890");
    expect(dto.username).to.equal("testuser");
    expect(dto.createdAt).to.deep.equal(new Date("2025-01-01"));
    expect(dto.updatedAt).to.deep.equal(new Date("2025-01-02"));
  });

  it("roles mapped via toDTO()", () => {
    const entity = createUserEntity({
      roles: [
        { toDTO: () => ({ id: "r1", name: "ADMIN" }) },
        { toDTO: () => ({ id: "r2", name: "USER" }) },
      ],
    });
    const dto = UserDto.fromEntity(entity);

    expect(dto.roles).to.deep.equal([
      { id: "r1", name: "ADMIN" },
      { id: "r2", name: "USER" },
    ]);
  });

  it("directPermissions mapped via toDTO()", () => {
    const entity = createUserEntity({
      directPermissions: [
        { toDTO: () => ({ id: "p1", slug: "wg:server:view" }) },
      ],
    });
    const dto = UserDto.fromEntity(entity);

    expect(dto.directPermissions).to.deep.equal([
      { id: "p1", slug: "wg:server:view" },
    ]);
  });

  it("null roles returns empty array", () => {
    const entity = createUserEntity({ roles: null });
    const dto = UserDto.fromEntity(entity);

    expect(dto.roles).to.deep.equal([]);
  });

  it("undefined roles returns empty array", () => {
    const entity = createUserEntity({ roles: undefined });
    const dto = UserDto.fromEntity(entity);

    expect(dto.roles).to.deep.equal([]);
  });

  it("null directPermissions returns empty array", () => {
    const entity = createUserEntity({ directPermissions: null });
    const dto = UserDto.fromEntity(entity);

    expect(dto.directPermissions).to.deep.equal([]);
  });

  it("profile mapped when present", () => {
    const entity = createUserEntity({
      profile: {
        id: "prof-1",
        userId: "user-1",
        firstName: "John",
        lastName: "Doe",
        createdAt: new Date("2025-01-01"),
        updatedAt: new Date("2025-01-02"),
      },
    });
    const dto = UserDto.fromEntity(entity);

    expect(dto.profile).to.not.be.undefined;
    expect(dto.profile!.firstName).to.equal("John");
  });
});

describe("PublicUserDto", () => {
  it("maps public fields correctly", () => {
    const entity = createUserEntity({
      profile: {
        id: "prof-1",
        firstName: "Jane",
        lastName: "Smith",
        status: "online",
        lastOnline: new Date("2025-06-01"),
      },
    });
    const dto = PublicUserDto.fromEntity(entity, NO_SIGNED_FILES);

    expect(dto.userId).to.equal("user-1");
    expect(dto.username).to.equal("testuser");
    expect(dto.profile).to.not.be.undefined;
    expect(dto.profile?.firstName).to.equal("Jane");
  });

  it("never exposes email", () => {
    const dto = PublicUserDto.fromEntity(createUserEntity(), NO_SIGNED_FILES);

    expect(dto).to.not.have.property("email");
  });

  it("hides phone unless privacy allows it", () => {
    const hidden = PublicUserDto.fromEntity(
      createUserEntity(),
      NO_SIGNED_FILES,
    );
    const shown = PublicUserDto.fromEntity(
      createUserEntity(),
      NO_SIGNED_FILES,
      {
        showPhone: true,
      },
    );

    expect(hidden.phone).to.be.null;
    expect(shown.phone).to.equal("+1234567890");
  });
});

describe("аватары пользователей", () => {
  const avatar = { id: "av-1" };
  const files = new Map([
    ["av-1", { id: "av-1", url: "https://s3/av-1?sig" } as IFileDto],
  ]);
  const entity = () =>
    createUserEntity({
      profile: { id: "prof-1", userId: "user-1", avatar },
    });

  it("collectUserFiles перечисляет аватары профилей", () => {
    expect(collectUserFiles([entity(), null])).to.deep.equal([
      avatar,
      undefined,
    ]);
  });

  it("UserDto и PublicUserDto берут ссылки из карты подписей", () => {
    expect(UserDto.fromEntity(entity(), files).profile!.avatar!.url).to.equal(
      "https://s3/av-1?sig",
    );
    expect(
      PublicUserDto.fromEntity(entity(), files).profile!.avatarUrl,
    ).to.equal("https://s3/av-1?sig");
  });

  it("без карты подписей аватар не отдаётся", () => {
    expect(UserDto.fromEntity(entity()).profile!.avatar).to.be.undefined;
    expect(
      PublicUserDto.fromEntity(entity(), NO_SIGNED_FILES).profile!.avatarUrl,
    ).to.be.null;
  });
});
