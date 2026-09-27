import { TokenProvider } from "../../core/decorators/module.decorator";

type Constructor<T = any> = new (...args: any[]) => T;

/**
 * Проба «файл используется» от модулей, которые ссылаются на файлы (аватар
 * профиля, кадр проекта, вложение сообщения). Модуль-потребитель регистрирует
 * `asFileUsageProbe(Cls)`: используемый файл нельзя удалить вручную, а
 * неиспользуемый бесхозный собирает сборщик мусора файлов.
 */
export const FILE_USAGE_PROBE = Symbol("FileUsageProbe");

export interface IFileUsageProbe {
  /** Из `fileIds` — те, на которые ссылается модуль. */
  filesInUse(fileIds: string[]): Promise<string[]>;
}

export const asFileUsageProbe = (
  cls: Constructor<IFileUsageProbe>,
): TokenProvider<IFileUsageProbe> => ({
  provide: FILE_USAGE_PROBE,
  useClass: cls,
});
