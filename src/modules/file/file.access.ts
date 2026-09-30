import { OwnedAccess } from "../../core";
import type { File } from "./file.entity";

/**
 * Свой файл — где пользователь владелец. Создателя отдельно нет: загрузивший
 * и есть владелец, а переданный домену файл (`adopt`) своим быть перестаёт.
 */
export const FileAccess = new OwnedAccess<File>({ owner: "ownerId" });
