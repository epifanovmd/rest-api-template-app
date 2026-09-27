import { TokenProvider } from "../../core/decorators/module.decorator";
import { EPrivacyLevel } from "./privacy-settings.entity";

type Constructor<T = any> = new (...args: any[]) => T;

/**
 * Кто кому «контакт» для уровня приватности `contacts`. Модуль контактов
 * регистрирует `asContactRelation(Cls)`; без него уровень `contacts` открывает
 * поле только самому пользователю.
 */
export const CONTACT_RELATION = Symbol("ContactRelation");

export interface IContactRelation {
  /** Из `userIds` — те, у кого `viewerId` в принятых контактах. */
  contactsOf(viewerId: string, userIds: string[]): Promise<string[]>;
}

/**
 * Кому видно присутствие пользователя (online/offline). Модули связей —
 * контакты, личные чаты — регистрируют `asPresenceAudience(Cls)`.
 */
export const PRESENCE_AUDIENCE = Symbol("PresenceAudience");

export interface IPresenceAudience {
  /** Кому рассылать online/offline пользователя при его уровне `showLastOnline`. */
  audience(userId: string, level: EPrivacyLevel): Promise<string[]>;
  /** Чей статус отправить пользователю при подключении (`presence:init`). */
  peers(userId: string): Promise<string[]>;
}

export const asContactRelation = (
  cls: Constructor<IContactRelation>,
): TokenProvider<IContactRelation> => ({
  provide: CONTACT_RELATION,
  useClass: cls,
});

export const asPresenceAudience = (
  cls: Constructor<IPresenceAudience>,
): TokenProvider<IPresenceAudience> => ({
  provide: PRESENCE_AUDIENCE,
  useClass: cls,
});
