import { prisma } from "../prisma.js";
import { logger } from "../pino.js";
import { invalidateTags } from "../cache.js";
import { CACHE_TAGS } from "../cacheTags.js";
import type { NotifChannel } from "../../generated/prisma/client.js";
import { deriveNotifType } from "./types.js";

export interface NotifyInput {
  userId: string;
  sourceTable: string;
  action: string;
  message: string;
  sourceId?: string;
  channel?: NotifChannel[];
}

const DEDUPE_WINDOW_MS = 60_000;

// A repeated write inside the window must not ring the same desk twice.
async function writeUnlessDuplicated(input: NotifyInput, type: string) {
  await prisma.$transaction(async (tx) => {
    if (input.sourceId) {
      const lockKey = `${input.userId}|${type}|${input.sourceTable}|${input.sourceId}|${input.message}`;
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, lockKey);
      const recent = await tx.notification.findFirst({
        where: {
          userId: input.userId,
          type,
          sourceTable: input.sourceTable,
          sourceId: input.sourceId,
          message: input.message,
          createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
        },
        select: { id: true },
      });
      if (recent) return;
    }
    await tx.notification.create({
      data: {
        userId: input.userId,
        type,
        sourceTable: input.sourceTable,
        sourceId: input.sourceId,
        message: input.message,
        channel: input.channel ?? ["web", "mobile", "email"],
      },
    });
  });
}

export async function fanoutNotification(input: NotifyInput) {
  try {
    await writeUnlessDuplicated(input, deriveNotifType(input.sourceTable, input.action));
    // Bust cached notification lists immediately so bell badges and the
    // realtime fallback polls see the row without waiting out the TTL.
    void invalidateTags([CACHE_TAGS.notifications]);
  } catch (e) {
    logger.error({ err: e, userId: input.userId }, "notification fanout failed");
  }
}

const FANOUT_PAGE_SIZE = 200;
const FANOUT_CONCURRENCY = 25;

async function recipientsForRole(role: string, excludeUserId?: string) {
  const recipients: { id: string; fullName: string }[] = [];
  let cursor: string | undefined;
  for (;;) {
    const users = await prisma.user.findMany({
      where: { role: role as never, status: "active" },
      select: { id: true, fullName: true },
      orderBy: { id: "asc" },
      take: FANOUT_PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    recipients.push(...users.filter((u) => u.id !== excludeUserId));
    if (users.length < FANOUT_PAGE_SIZE) return recipients;
    cursor = users[users.length - 1]!.id;
  }
}

export async function fanoutToRole(
  role: string,
  input: Omit<NotifyInput, "userId"> & {
    excludeUserId?: string;
    messageFor?: (recipient: { id: string; fullName: string }) => string;
  },
) {
  try {
    // Every active holder of the role gets the row. This used to `take: 10`,
    // which silently dropped recipients 11+ — a school has more than ten teachers.
    const recipients = await recipientsForRole(role, input.excludeUserId);
    for (let i = 0; i < recipients.length; i += FANOUT_CONCURRENCY) {
      await Promise.all(
        recipients.slice(i, i + FANOUT_CONCURRENCY).map((u) =>
          fanoutNotification({
            userId: u.id,
            sourceTable: input.sourceTable,
            action: input.action,
            message: input.messageFor?.(u) ?? input.message,
            sourceId: input.sourceId,
            channel: input.channel,
          }),
        ),
      );
    }
    if (recipients.length === 0) {
      logger.debug({ role }, "role notification fanout had no active recipients");
    }
  } catch (e) {
    logger.error({ err: e, role }, "role notification fanout failed");
  }
}
