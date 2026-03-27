import "reflect-metadata";

import { NotFoundException } from "@force-dev/utils";
import { expect } from "chai";
import sinon from "sinon";

import { createMockRepository, uuid, uuid2 } from "../../test/helpers";
import { Permissions } from "../permission/permission.types";
import { RoleService } from "./role.service";
import { Roles } from "./role.types";

describe("RoleService", () => {
  let service: RoleService;
  let roleRepo: ReturnType<typeof createMockRepository>;
  let permissionRepo: ReturnType<typeof createMockRepository>;
  let sandbox: sinon.SinonSandbox;

  const roleId = uuid();
  const permissionId = uuid2();

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    roleRepo = createMockRepository();
    permissionRepo = createMockRepository();

    (roleRepo as any).findAll = sinon.stub().resolves([]);
    (roleRepo as any).findById = sinon.stub().resolves(null);
    (roleRepo as any).findByName = sinon.stub().resolves(null);

    (permissionRepo as any).findByName = sinon.stub().resolves(null);

    service = new RoleService(roleRepo as any, permissionRepo as any);
  });

  afterEach(() => sandbox.restore());

  describe("getRoles", () => {
    it("should return list of roles", async () => {
      const roles = [
        { id: roleId, name: Roles.ADMIN, permissions: [] },
        { id: uuid2(), name: Roles.USER, permissions: [] },
      ];

      (roleRepo as any).findAll.resolves(roles);

      const result = await service.getRoles();

      expect(result).to.deep.equal(roles);
      expect((roleRepo as any).findAll.calledOnce).to.be.true;
    });
  });

  describe("setRolePermissions", () => {
    it("should update role permissions when role is found", async () => {
      const role: any = { id: roleId, name: Roles.USER, permissions: [] };
      const perm = { id: permissionId, name: Permissions.USER_VIEW };
      const updatedRole = { ...role, permissions: [perm] };

      (roleRepo as any).findById
        .onFirstCall().resolves(role)
        .onSecondCall().resolves(updatedRole);
      (permissionRepo as any).findByName.resolves(perm);
      roleRepo.save.resolves(role);

      const result = await service.setRolePermissions(roleId, [Permissions.USER_VIEW]);

      expect((roleRepo as any).findById.calledTwice).to.be.true;
      expect(roleRepo.save.calledOnce).to.be.true;
      expect(result).to.deep.equal(updatedRole);
    });

    it("should create permission if it does not exist", async () => {
      const role: any = { id: roleId, name: Roles.USER, permissions: [] };
      const newPerm = { id: permissionId, name: Permissions.USER_MANAGE };

      (roleRepo as any).findById
        .onFirstCall().resolves(role)
        .onSecondCall().resolves({ ...role, permissions: [newPerm] });
      (permissionRepo as any).findByName.resolves(null);
      permissionRepo.createAndSave.resolves(newPerm);
      roleRepo.save.resolves(role);

      await service.setRolePermissions(roleId, [Permissions.USER_MANAGE]);

      expect(permissionRepo.createAndSave.calledOnceWith({ name: Permissions.USER_MANAGE })).to.be.true;
    });

    it("should throw NotFoundException when role is not found", async () => {
      (roleRepo as any).findById.resolves(null);

      try {
        await service.setRolePermissions(roleId, [Permissions.USER_VIEW]);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  describe("seedDefaultPermissions", () => {
    it("should create roles with default permissions when they do not exist", async () => {
      const createdRoles: Record<string, any> = {};

      (roleRepo as any).findByName.callsFake(async (name: string) => {
        return createdRoles[name] || null;
      });

      roleRepo.createAndSave.callsFake(async (data: any) => {
        const role = { id: `id-${data.name}`, ...data, permissions: [] };

        createdRoles[data.name] = role;

        return role;
      });

      // findById is called inside setRolePermissions
      (roleRepo as any).findById.callsFake(async (id: string) => {
        const role = Object.values(createdRoles).find((r: any) => r.id === id);

        return role || null;
      });

      (permissionRepo as any).findByName.resolves(null);
      permissionRepo.createAndSave.callsFake(async (data: any) => ({
        id: `perm-${data.name}`,
        ...data,
      }));
      roleRepo.save.resolves();

      await service.seedDefaultPermissions();

      // Should have created 3 roles (ADMIN, USER, GUEST)
      expect(roleRepo.createAndSave.callCount).to.equal(3);
    });

    it("should not overwrite existing role permissions", async () => {
      const existingRole = {
        id: roleId,
        name: Roles.ADMIN,
        permissions: [{ id: permissionId, name: Permissions.ALL }],
      };

      (roleRepo as any).findByName.callsFake(async (name: string) => {
        if (name === Roles.ADMIN) return existingRole;

        return null;
      });

      roleRepo.createAndSave.callsFake(async (data: any) => ({
        id: `id-${data.name}`,
        ...data,
        permissions: [],
      }));

      (roleRepo as any).findById.callsFake(async (id: string) => {
        if (id === roleId) return existingRole;

        return { id, permissions: [], name: Roles.USER };
      });

      (permissionRepo as any).findByName.resolves(null);
      permissionRepo.createAndSave.callsFake(async (data: any) => ({
        id: `perm-${data.name}`,
        ...data,
      }));
      roleRepo.save.resolves();

      await service.seedDefaultPermissions();

      // ADMIN role already has permissions, so setRolePermissions should not be called for it
      // Only USER and GUEST should have setRolePermissions called
      const findByIdCalls = (roleRepo as any).findById.getCalls();
      const calledWithAdminId = findByIdCalls.some((c: any) => c.args[0] === roleId);

      expect(calledWithAdminId).to.be.false;
    });
  });
});
