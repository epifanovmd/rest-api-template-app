import type { MulticastMessage } from "firebase-admin/messaging";

export enum EDevicePlatform {
  IOS = "ios",
  ANDROID = "android",
  WEB = "web",
}

export interface IPushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  /**
   * Что показать получателю с `showPreview = false` вместо title/body.
   * Не задано — общий текст без содержимого.
   */
  hiddenPreview?: { title: string; body: string };
}

/** Очередь отправки push-уведомлений. */
export const PUSH_SEND_QUEUE = "push.send";

/** Готовое FCM-сообщение без адресатов. */
export type TPushMessage = Omit<MulticastMessage, "tokens">;

/** Одна multicast-рассылка: токены с одинаковыми настройками получателя. */
export interface IPushDelivery {
  tokens: string[];
  message: TPushMessage;
}

/**
 * Данные задачи `push.send`: либо пользователи (токены и настройки
 * читаются при выполнении), либо готовые рассылки — повтор тех токенов,
 * которые FCM не принял из-за временного сбоя.
 */
export type TPushSendJobData =
  | { userIds: string[]; payload: IPushPayload }
  | { deliveries: IPushDelivery[]; retry: number };
