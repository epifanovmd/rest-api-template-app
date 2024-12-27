import { Otp } from "./otp/otp.model";
import { Passkeys } from "./passkeys/passkeys.model";
import { Permission } from "./permission/permission.model";
import { Profile } from "./profile/profile.model";
import { ResetPasswordTokens } from "./reset-password-tokens/reset-password-tokens.model";
import { Role } from "./role/role.model";

Profile.belongsTo(Role, { foreignKey: "roleId" });
Profile.hasMany(Passkeys, { onDelete: "CASCADE" });
Passkeys.belongsTo(Profile);
Profile.hasMany(Otp, { onDelete: "CASCADE" });
Otp.belongsTo(Profile);
Profile.hasMany(ResetPasswordTokens, { onDelete: "CASCADE" });
ResetPasswordTokens.belongsTo(Profile);

Role.hasMany(Profile, { onDelete: "CASCADE" });
Role.belongsToMany(Permission, {
  through: "rolePermissions",
  onDelete: "CASCADE",
});

Permission.belongsToMany(Role, {
  through: "rolePermissions",
  onDelete: "CASCADE",
});
