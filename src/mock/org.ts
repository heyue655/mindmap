import type { Department, OrgRelation, User } from "@/types";

export const departments: Department[] = [
  { id: "d-root", name: "全公司" },
  { id: "d-prod", name: "产品中心", parentId: "d-root" },
  { id: "d-eng", name: "研发中心", parentId: "d-root" },
  { id: "d-eng-fe", name: "前端组", parentId: "d-eng" },
  { id: "d-eng-be", name: "后端组", parentId: "d-eng" },
  { id: "d-design", name: "设计中心", parentId: "d-root" },
];

// 10 名员工，3 层组织
// 注：默认所有人都已绑钉钉，并各自连接了不同的日历组合。这是为了 demo 演示
// "派任务/状态变化 → 推到钉钉" 与 "三家日历同步" 的效果。
export const users: User[] = [
  // L1 CEO
  {
    id: "u-ceo",
    employeeNo: "E001",
    name: "周老板",
    email: "ceo@demo.com",
    avatar: "👔",
    departmentId: "d-root",
    jobTitle: "CEO",
    status: "active",
    dingtalkBound: true,
    connectedCalendars: ["mac", "dingtalk"],
  },

  // L2 部门 VP
  {
    id: "u-prod-vp",
    employeeNo: "E002",
    name: "吴产品",
    email: "wu@demo.com",
    avatar: "🧭",
    departmentId: "d-prod",
    jobTitle: "产品中心 VP",
    status: "active",
    dingtalkBound: true,
    connectedCalendars: ["dingtalk", "google"],
  },
  {
    id: "u-eng-vp",
    employeeNo: "E003",
    name: "李研发",
    email: "li@demo.com",
    avatar: "🛠️",
    departmentId: "d-eng",
    jobTitle: "研发中心 VP",
    status: "active",
    dingtalkBound: true,
    connectedCalendars: ["mac", "dingtalk", "google"],
  },
  {
    id: "u-design-lead",
    employeeNo: "E004",
    name: "陈设计",
    email: "chen@demo.com",
    avatar: "🎨",
    departmentId: "d-design",
    jobTitle: "设计中心负责人",
    status: "active",
    dingtalkBound: true,
    connectedCalendars: ["mac"],
  },

  // L3 组长
  {
    id: "u-fe-lead",
    employeeNo: "E005",
    name: "孟增",
    email: "meng@demo.com",
    avatar: "💻",
    departmentId: "d-eng-fe",
    jobTitle: "前端组 Lead",
    status: "active",
    dingtalkBound: true,
    connectedCalendars: ["mac", "dingtalk", "google"],
  },
  {
    id: "u-be-lead",
    employeeNo: "E006",
    name: "Sophia",
    email: "sophia@demo.com",
    avatar: "🗄️",
    departmentId: "d-eng-be",
    jobTitle: "后端组 Lead",
    status: "active",
    dingtalkBound: true,
    connectedCalendars: ["dingtalk"],
  },

  // L4 员工
  {
    id: "u-fe-dev1",
    employeeNo: "E007",
    name: "JOJO",
    email: "jojo@demo.com",
    avatar: "🐱",
    departmentId: "d-eng-fe",
    jobTitle: "前端工程师",
    status: "active",
    dingtalkBound: true,
    connectedCalendars: ["mac", "dingtalk", "google"],
  },
  {
    id: "u-fe-dev2",
    employeeNo: "E008",
    name: "Tina",
    email: "tina@demo.com",
    avatar: "🦊",
    departmentId: "d-eng-fe",
    jobTitle: "前端工程师",
    status: "active",
    dingtalkBound: true,
    connectedCalendars: ["mac", "dingtalk"],
  },
  {
    id: "u-be-dev1",
    employeeNo: "E009",
    name: "Marcus",
    email: "marcus@demo.com",
    avatar: "🐻",
    departmentId: "d-eng-be",
    jobTitle: "后端工程师",
    status: "active",
    dingtalkBound: true,
    connectedCalendars: ["dingtalk", "google"],
  },
  {
    id: "u-pm1",
    employeeNo: "E010",
    name: "Alice",
    email: "alice@demo.com",
    avatar: "🌸",
    departmentId: "d-prod",
    jobTitle: "产品经理",
    status: "active",
    dingtalkBound: true,
    connectedCalendars: ["mac", "google"],
  },
];

// 实线汇报关系（实线树）
//
// 周老板（CEO）
// ├── 吴产品（产品VP）
// │     └── Alice（PM）
// ├── 李研发（研发VP）
// │     ├── 孟增（前端Lead）
// │     │     ├── JOJO
// │     │     └── Tina
// │     └── Sophia（后端Lead）
// │           └── Marcus
// └── 陈设计（设计Lead）
//
// 虚线：JOJO 同时虚线汇报给 Alice（项目临时上级）
export const orgRelations: OrgRelation[] = [
  // 实线
  {
    id: "or-1",
    subordinateId: "u-prod-vp",
    managerId: "u-ceo",
    relationType: "solid",
    effectiveFrom: "2024-01-01",
  },
  {
    id: "or-2",
    subordinateId: "u-eng-vp",
    managerId: "u-ceo",
    relationType: "solid",
    effectiveFrom: "2024-01-01",
  },
  {
    id: "or-3",
    subordinateId: "u-design-lead",
    managerId: "u-ceo",
    relationType: "solid",
    effectiveFrom: "2024-01-01",
  },
  {
    id: "or-4",
    subordinateId: "u-pm1",
    managerId: "u-prod-vp",
    relationType: "solid",
    effectiveFrom: "2024-01-01",
  },
  {
    id: "or-5",
    subordinateId: "u-fe-lead",
    managerId: "u-eng-vp",
    relationType: "solid",
    effectiveFrom: "2024-01-01",
  },
  {
    id: "or-6",
    subordinateId: "u-be-lead",
    managerId: "u-eng-vp",
    relationType: "solid",
    effectiveFrom: "2024-01-01",
  },
  {
    id: "or-7",
    subordinateId: "u-fe-dev1",
    managerId: "u-fe-lead",
    relationType: "solid",
    effectiveFrom: "2024-01-01",
  },
  {
    id: "or-8",
    subordinateId: "u-fe-dev2",
    managerId: "u-fe-lead",
    relationType: "solid",
    effectiveFrom: "2024-01-01",
  },
  {
    id: "or-9",
    subordinateId: "u-be-dev1",
    managerId: "u-be-lead",
    relationType: "solid",
    effectiveFrom: "2024-01-01",
  },

  // 虚线（JOJO 项目期间也汇报给 Alice）
  {
    id: "or-d-1",
    subordinateId: "u-fe-dev1",
    managerId: "u-pm1",
    relationType: "dotted",
    effectiveFrom: "2026-03-01",
    effectiveTo: "2026-09-30",
  },
];
