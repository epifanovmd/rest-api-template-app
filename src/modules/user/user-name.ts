/** Поля пользователя, из которых складывается отображаемое имя. */
export interface IUserNameSource {
  email: string | null;
  profile?: {
    firstName: string | null;
    lastName: string | null;
  } | null;
}

/** Отображаемое имя пользователя: имя и фамилия профиля, иначе email. */
export const userDisplayName = (
  user: IUserNameSource | null | undefined,
): string | null => {
  if (!user) return null;

  return (
    [user.profile?.firstName, user.profile?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || user.email
  );
};
