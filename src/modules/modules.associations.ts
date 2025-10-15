import { Biometric } from "./biometric/biometric.model";
import { Dialog } from "./dialog/dialog.model";
import { DialogMembers } from "./dialog-members/dialog-members.model";
import { MessageFiles } from "./dialog-messages/dialog-message-files.model";
import { DialogMessages } from "./dialog-messages/dialog-messages.model";
import { FcmToken } from "./fcm-token/fcm-token.model";
import { Files } from "./file/file.model";
import { Otp } from "./otp/otp.model";
import { Passkeys } from "./passkeys/passkeys.model";
import { Permission } from "./permission/permission.model";
import { Profile } from "./profile/profile.model";
import { ResetPasswordTokens } from "./reset-password-tokens/reset-password-tokens.model";
import { Role } from "./role/role.model";
import { User } from "./user/user.model";

// Пользователь и роли
User.belongsTo(Role, { foreignKey: "roleId" });
Role.hasMany(User, { onDelete: "CASCADE" });

// Пользователь и профиль
User.hasOne(Profile, {
  foreignKey: "userId",
  as: "profile",
  onDelete: "CASCADE",
});
Profile.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
  onDelete: "CASCADE",
});
Profile.belongsTo(Files, {
  foreignKey: "avatarId",
  as: "avatar",
});

// Пользователь и passkeys
User.hasMany(Passkeys, { onDelete: "CASCADE" });
Passkeys.belongsTo(User);

// Пользователь и biometric
User.hasMany(Biometric, { onDelete: "CASCADE" });
Biometric.belongsTo(User);

// Пользователь и OTP
User.hasMany(Otp, { onDelete: "CASCADE" });
Otp.belongsTo(User);

// Пользователь и токены сброса пароля
User.hasMany(ResetPasswordTokens, { onDelete: "CASCADE" });
ResetPasswordTokens.belongsTo(User);

// Пользователь и FCM токены
User.hasMany(FcmToken, { onDelete: "CASCADE" });
FcmToken.belongsTo(User);

// Пользователь и avatar
User.belongsTo(Files, {
  foreignKey: "avatarId", // Поле в User, хранящее ID файла
  as: "avatar", // Алиас
});

// Роли и разрешения (многие ко многим)
Role.belongsToMany(Permission, {
  through: "role-permissions",
  onDelete: "CASCADE",
});
Permission.belongsToMany(Role, {
  through: "role-permissions",
  onDelete: "CASCADE",
});

// Диалог и владелец
Dialog.belongsTo(User, {
  foreignKey: "ownerId",
  as: "owner",
});

// Диалог и связанные сущности
Dialog.hasMany(DialogMembers, { onDelete: "CASCADE" });
Dialog.hasMany(DialogMessages, { onDelete: "CASCADE" });
Dialog.hasMany(DialogMessages, {
  as: "lastMessage",
  onDelete: "CASCADE",
});

// Сообщения и их связи
DialogMessages.belongsTo(User);

// Для изображений
DialogMessages.belongsToMany(Files, {
  through: {
    model: MessageFiles,
    scope: { fileType: "image" },
  },
  foreignKey: "messageId",
  otherKey: "fileId",
  as: "images", // Ассоциация для изображений
});

// Для видео
DialogMessages.belongsToMany(Files, {
  through: {
    model: MessageFiles,
    scope: { fileType: "video" },
  },
  foreignKey: "messageId",
  otherKey: "fileId",
  as: "videos", // Ассоциация для видео
});

// Для аудио
DialogMessages.belongsToMany(Files, {
  through: {
    model: MessageFiles,
    scope: { fileType: "audio" },
  },
  foreignKey: "messageId",
  otherKey: "fileId",
  as: "audios", // Ассоциация для аудио
});

DialogMessages.belongsTo(DialogMessages, {
  foreignKey: "replyId",
  as: "reply",
  onDelete: "SET NULL",
});

// Участники диалога
User.hasMany(DialogMembers);
DialogMembers.belongsTo(User);
DialogMembers.belongsTo(Dialog);
