import { prisma } from "../../db/client";
import { ConnectionResponseDto, SyncRunDto } from "./dto/connection.dto";

export class ConnectionsService {
  async listConnections(userId: string): Promise<ConnectionResponseDto[]> {
    return prisma.connection.findMany({
      where: { userId },
      select: {
        id: true,
        platform: true,
        accountId: true,
        accountName: true,
        status: true,
        createdAt: true,
        tokenExpiresAt: true,
        lastSyncAt: true,
        lastSyncOk: true,
        lastSyncError: true,
        syncSince: true,
        syncUntil: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getConnectionSyncs(
    userId: string,
    id: string,
    limit: number = 50
  ): Promise<SyncRunDto[] | null> {
    const connection = await prisma.connection.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!connection) return null;

    const boundedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return prisma.syncRun.findMany({
      where: { connectionId: id },
      orderBy: { startedAt: "desc" },
      take: boundedLimit,
      select: {
        id: true,
        startedAt: true,
        finishedAt: true,
        ok: true,
        error: true,
        campaignCount: true,
        insightCount: true,
      },
    });
  }

  async deleteConnection(userId: string, id: string): Promise<boolean> {
    const connection = await prisma.connection.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!connection) return false;

    await prisma.connection.delete({ where: { id } });
    return true;
  }
}

export const connectionsService = new ConnectionsService();
