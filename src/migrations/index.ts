import { InitialSchema1790353961289 } from "./1790353961289-InitialSchema";
import { JobRunStop1790357606328 } from "./1790357606328-JobRunStop";
import { FileOwnerSetNull1790358900018 } from "./1790358900018-FileOwnerSetNull";
import { JobWorkers1790363180288 } from "./1790363180288-JobWorkers";

/**
 * Миграции в порядке применения. Новая миграция: `yarn migration:generate
 * src/migrations/<Name>` → добавить класс сюда. Применённые миграции не
 * редактируются — изменение схемы = новая миграция.
 */
export const migrations: Function[] = [
  InitialSchema1790353961289,
  JobRunStop1790357606328,
  FileOwnerSetNull1790358900018,
  JobWorkers1790363180288,
];
