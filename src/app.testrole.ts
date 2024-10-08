import {
  BelongsToManyAddAssociationsMixin,
  BelongsToManySetAssociationsMixin,
  DataTypes,
  Model,
} from "sequelize";

import { sequelize } from "./db";

// Модель User
class User extends Model {
  public id: number;
  public username: string;
  public email: string;
  public roleId: number;
}

User.init(
  {
    username: DataTypes.STRING,
    email: DataTypes.STRING,
  },
  {
    sequelize,
    modelName: "User",
  },
);

// Модель Role
class Role extends Model {
  public id: number;
  public name: string;
  public addPermissions: BelongsToManyAddAssociationsMixin<Permission, number>;
  public setPermissions: BelongsToManySetAssociationsMixin<Permission, number>;
}

Role.init(
  {
    name: DataTypes.STRING,
  },
  {
    sequelize,
    modelName: "Role",
  },
);

// Модель Permission
class Permission extends Model {
  public id: number;
  public name: string;
}

Permission.init(
  {
    name: DataTypes.STRING,
  },
  {
    sequelize,
    modelName: "Permission",
  },
);

User.belongsTo(Role, { onDelete: "CASCADE" });
Role.hasMany(User, { onDelete: "CASCADE" });
Role.belongsToMany(Permission, {
  through: "RolePermissions",
  onDelete: "CASCADE",
});
Permission.belongsToMany(Role, {
  through: "RolePermissions",
  onDelete: "CASCADE",
});

class UserService {
  // Создание нового пользователя с ролью и разрешениями
  async createUserWithRoleAndPermissions(
    username: string,
    email: string,
    roleName: string,
    permissionNames: string[],
  ): Promise<User> {
    // Создаем или находим роль по имени
    const [role] = await Role.findOrCreate({
      where: { name: roleName },
    });

    // Находим или создаем разрешения
    const permissions = await Promise.all(
      permissionNames.map(name => Permission.findOrCreate({ where: { name } })),
    );

    // Извлекаем экземпляры разрешений
    const permissionInstances = permissions.map(([permission]) => permission);

    // Связываем разрешения с ролью
    await role.setPermissions(permissionInstances);

    // Создаем пользователя и связываем его с ролью
    const user = await User.create({
      username,
      email,
      roleId: role.id,
    });

    return user;
  }
}

// Синхронизация моделей с базой данных
export async function syncDatabase() {
  await sequelize.drop({ cascade: true });
  await sequelize.sync({ force: true });

  // Пример использования сервиса
  const userService = new UserService();

  try {
    const user = await userService.createUserWithRoleAndPermissions(
      "john_doe",
      "john@example.com",
      "admin",
      ["read", "write", "delete"],
    );

    user.destroy();

    // const role = await Role.findByPk(1);
    //
    // if (!role) {
    //   throw new Error("Role not found");
    // }
    //
    // // Удаление роли
    // await role.destroy();

    console.log(`User created: ${user.username}`);
    console.log(`User created: ${user.roleId}`);
  } catch (error) {
    console.error("Error creating user:", error);
  }

  // Определение связей
  console.log("Database synchronized");
}
