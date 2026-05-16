export type UserSession = {
  githubLogin: string;
  avatarUrl: string | null;
  githubUserId: string;
  installationId: number | null;
};

export type UserSessionPayload = UserSession & {
  iat: number;
  exp: number;
};
