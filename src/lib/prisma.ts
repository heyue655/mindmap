/**
 * 规范 2-2：Prisma 客户端单例 + 时区中间件
 *
 * - 每次查询前执行 SET time_zone = '+08:00'，确保 MySQL CURRENT_TIMESTAMP 以北京时间写入
 * - 开发模式防止 HMR 导致多实例
 */

import { PrismaClient } from "@prisma/client";

/** 创建并配置 Prisma 客户端 */
function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: ["warn", "error"],
  });

  // 规范 2-2：每次查询前设置时区为北京时间
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).$use(async (params: any, next: any) => {
    // 跳过 raw 查询动作，防止 $executeRawUnsafe 自身触发中间件导致无限递归
    if (params.action !== "executeRaw" && params.action !== "queryRaw") {
      await client.$executeRawUnsafe(`SET time_zone = '+08:00'`);
    }
    return next(params);
  });

  return client;
}

// 防止 Next.js HMR 热重载时创建多个 Prisma 实例
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
