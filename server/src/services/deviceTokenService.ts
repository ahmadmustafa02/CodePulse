import { createHash, randomBytes } from 'crypto';
import { prisma } from './prismaService';
import type { UserSession } from '../types/session';

const TOKEN_PREFIX = 'cpat_';

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function toUserSession(user: {
  githubLogin: string;
  avatarUrl: string | null;
  githubUserId: bigint;
  installationId: number | null;
}): UserSession {
  return {
    githubLogin: user.githubLogin,
    avatarUrl: user.avatarUrl,
    githubUserId: user.githubUserId.toString(),
    installationId: user.installationId,
  };
}

export async function generateDeviceToken(
  userId: string,
  name: string,
): Promise<{ token: string; id: string; name: string; createdAt: Date }> {
  const rawHex = randomBytes(32).toString('hex');
  const token = `${TOKEN_PREFIX}${rawHex}`;
  const tokenHash = sha256Hex(token);

  const row = await prisma.deviceToken.create({
    data: {
      userId,
      tokenHash,
      name: name.trim(),
    },
  });

  return {
    token,
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
  };
}

export async function verifyDeviceToken(rawToken: string): Promise<UserSession | null> {
  const tokenHash = sha256Hex(rawToken);
  const row = await prisma.deviceToken.findFirst({
    where: { tokenHash, revokedAt: null },
    include: { user: true },
  });

  if (!row) {
    return null;
  }

  void prisma.deviceToken
    .update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => undefined);

  return toUserSession(row.user);
}

export async function listDeviceTokens(userId: string) {
  return prisma.deviceToken.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
  });
}

export async function revokeDeviceToken(userId: string, tokenId: string): Promise<boolean> {
  const result = await prisma.deviceToken.updateMany({
    where: { id: tokenId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}
