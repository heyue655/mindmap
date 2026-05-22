/**
 * scripts/sync-db-comments.ts
 * 规范 2-3：将 prisma/schema.prisma 中的 /// 三斜线注释同步为 MySQL 表/列 COMMENT
 *
 * 执行：npm run db:comments
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("错误：未设置 DATABASE_URL 环境变量");
  process.exit(1);
}

// 解析 DATABASE_URL（mysql://user:pass@host:port/dbname）
const url = new URL(DATABASE_URL);
const dbConfig = {
  host: url.hostname,
  port: parseInt(url.port || "3306"),
  user: url.username,
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ""),
};

// 从 schema.prisma 解析注释
interface FieldComment {
  fieldName: string;
  comment: string;
}
interface TableComment {
  modelName: string;
  tableName: string;
  tableComment: string;
  fields: FieldComment[];
}

function parseSchemaComments(schemaPath: string): TableComment[] {
  const content = readFileSync(schemaPath, "utf-8");
  const lines = content.split("\n");
  const tables: TableComment[] = [];

  let pendingComment = "";
  let currentTable: TableComment | null = null;
  let pendingFieldComment = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // 三斜线注释
    if (line.startsWith("///")) {
      const comment = line.replace(/^\/\/\/\s*/, "").trim();
      if (currentTable) {
        pendingFieldComment = comment;
      } else {
        pendingComment = comment;
      }
      continue;
    }

    // model 开始
    const modelMatch = line.match(/^model\s+(\w+)\s*\{/);
    if (modelMatch) {
      currentTable = {
        modelName: modelMatch[1],
        tableName: "",
        tableComment: pendingComment,
        fields: [],
      };
      pendingComment = "";
      pendingFieldComment = "";
      continue;
    }

    // @@map（表名映射）
    const mapMatch = line.match(/@@map\("([^"]+)"\)/);
    if (mapMatch && currentTable) {
      currentTable.tableName = mapMatch[1];
      continue;
    }

    // 模型结束
    if (line === "}" && currentTable) {
      if (!currentTable.tableName) {
        // 没有 @@map 则用 model 名小写
        currentTable.tableName = currentTable.modelName.toLowerCase() + "s";
      }
      tables.push(currentTable);
      currentTable = null;
      pendingFieldComment = "";
      continue;
    }

    // 字段行（在 model 内）
    if (currentTable && pendingFieldComment) {
      const fieldMatch = line.match(/^(\w+)\s+/);
      if (
        fieldMatch &&
        !line.startsWith("@@") &&
        !line.startsWith("//")
      ) {
        currentTable.fields.push({
          fieldName: fieldMatch[1],
          comment: pendingFieldComment,
        });
        pendingFieldComment = "";
      } else {
        pendingFieldComment = "";
      }
    } else {
      pendingFieldComment = "";
    }
  }

  return tables;
}

function escapeComment(s: string): string {
  return s.replace(/'/g, "''");
}

async function syncComments() {
  const schemaPath = resolve(__dirname, "../prisma/schema.prisma");
  const tables = parseSchemaComments(schemaPath);

  const conn = await mysql.createConnection(dbConfig);
  console.log(`连接数据库 ${dbConfig.database} 成功，开始同步注释...`);

  let tableCount = 0;
  let fieldCount = 0;

  for (const table of tables) {
    if (!table.tableName) continue;

    // 获取当前表结构（用于 MODIFY COLUMN 需要原类型）
    let columns: Array<{
      Field: string;
      Type: string;
      Null: string;
      Key: string;
      Default: string | null;
      Extra: string;
    }>;
    try {
      [columns] = (await conn.execute(`SHOW FULL COLUMNS FROM \`${table.tableName}\``)) as [
        typeof columns,
        unknown,
      ];
    } catch {
      console.warn(`  跳过（表不存在）：${table.tableName}`);
      continue;
    }

    // 更新表注释
    if (table.tableComment) {
      await conn.execute(
        `ALTER TABLE \`${table.tableName}\` COMMENT = '${escapeComment(table.tableComment)}'`,
      );
      tableCount++;
      console.log(`  ✓ 表 ${table.tableName}：${table.tableComment}`);
    }

    // 更新字段注释
    for (const fc of table.fields) {
      const col = columns.find((c) => c.Field === fc.fieldName);
      if (!col) continue;

      const nullable = col.Null === "YES" ? "NULL" : "NOT NULL";
      const defaultClause =
        col.Default !== null
          ? `DEFAULT '${col.Default}'`
          : col.Extra.includes("auto_increment")
            ? ""
            : "";
      const extraClause = col.Extra ? col.Extra : "";

      try {
        const sql = [
          `ALTER TABLE \`${table.tableName}\``,
          `MODIFY COLUMN \`${fc.fieldName}\` ${col.Type}`,
          nullable,
          defaultClause,
          extraClause,
          `COMMENT '${escapeComment(fc.comment)}'`,
        ]
          .filter(Boolean)
          .join(" ");
        await conn.execute(sql);
        fieldCount++;
      } catch (e) {
        console.warn(`  跳过字段 ${table.tableName}.${fc.fieldName}：${(e as Error).message}`);
      }
    }
  }

  await conn.end();
  console.log(`\n同步完成：${tableCount} 张表、${fieldCount} 个字段注释已更新`);
}

syncComments().catch((e) => {
  console.error("同步失败：", e);
  process.exit(1);
});
