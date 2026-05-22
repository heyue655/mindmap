-- ============================================================
-- clear-db.sql — 清空所有业务表 + 重建 admin 用户
-- 在 MySQL 中直接执行此文件即可
--
-- 工号：E001
-- 密码：Admin@123456（bcrypt cost=12）
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE calendar_syncs;
TRUNCATE TABLE mention_events;
TRUNCATE TABLE node_shares;
TRUNCATE TABLE attachments;
TRUNCATE TABLE task_logs;
TRUNCATE TABLE relationships;
TRUNCATE TABLE nodes;
TRUNCATE TABLE mindmaps;
TRUNCATE TABLE app_notifications;
TRUNCATE TABLE work_reports;
TRUNCATE TABLE follow_grants;
TRUNCATE TABLE assignments;
TRUNCATE TABLE org_relations;
TRUNCATE TABLE users;
TRUNCATE TABLE departments;

SET FOREIGN_KEY_CHECKS = 1;

-- 顶级部门
INSERT INTO departments (name, parentId, dingDeptId)
VALUES ('公司', NULL, NULL);

-- Admin 用户（密码：Admin@123456）
INSERT INTO users (
  employeeNo, name, email, passwordHash,
  departmentId, jobTitle, status, isAdmin,
  dingtalkBound, mustResetPassword, createdAt, updatedAt
) VALUES (
  'E001',
  '管理员',
  'E001@company.local',
  '$2a$12$rYGJpiGuMnpPeW7QnassA.BN.mCl83uXeaOL9wMrUyjFEO72f00bu',
  1,
  '系统管理员',
  'active',
  1,
  0,
  0,
  NOW(),
  NOW()
);
