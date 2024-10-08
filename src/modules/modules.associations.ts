import { Permission } from "./permission";
import { Profile } from "./profile";
import { Role } from "./role";

Role.hasMany(Profile, { onDelete: "CASCADE" });
Profile.belongsTo(Role, { foreignKey: "roleId" });
Role.belongsToMany(Permission, {
  through: "rolePermissions",
  onDelete: "CASCADE",
});
Permission.belongsToMany(Role, {
  through: "rolePermissions",
  onDelete: "CASCADE",
});
