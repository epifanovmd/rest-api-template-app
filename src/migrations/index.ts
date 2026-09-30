import { InitialSchema1790353961289 } from "./1790353961289-InitialSchema";
import { Workspaces1790355361639 } from "./1790355361639-Workspaces";
import { JobRunStop1790357606328 } from "./1790357606328-JobRunStop";
import { FileOwnerSetNull1790358900018 } from "./1790358900018-FileOwnerSetNull";
import { JobWorkers1790363180288 } from "./1790363180288-JobWorkers";
import { WorkspaceDescription1790366564017 } from "./1790366564017-WorkspaceDescription";
import { SplitManagePermissions1790600000000 } from "./1790600000000-SplitManagePermissions";
import { JobRunEventSeq1790776771285 } from "./1790776771285-JobRunEventSeq";
import { OwnFilePermissions1790770000000 } from "./1790770000000-OwnFilePermissions";

/**
 * Миграции в порядке применения. Новая миграция: `yarn migration:generate
 * src/migrations/<Name>` → добавить класс сюда. Применённые миграции не
 * редактируются — изменение схемы = новая миграция.
 */
export const migrations: Function[] = [
  InitialSchema1790353961289,
  Workspaces1790355361639,
  JobRunStop1790357606328,
  FileOwnerSetNull1790358900018,
  JobWorkers1790363180288,
  WorkspaceDescription1790366564017,
  SplitManagePermissions1790600000000,
  OwnFilePermissions1790770000000,
  JobRunEventSeq1790776771285,
];
