import { z } from "zod";

export const MoveChatToFolderSchema = z.object({
  folderId: z
    .string()
    .uuid("Некорректный UUID")
    .nullable(),
});
