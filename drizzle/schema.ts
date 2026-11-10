import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/** Core user table backing the optional Manus auth flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const testbedRuns = mysqlTable("testbed_runs", {
  id: int("id").autoincrement().primaryKey(),
  runId: varchar("runId", { length: 64 }).notNull().unique(),
  label: varchar("label", { length: 120 }).notNull(),
  guardrailsEnabled: int("guardrailsEnabled").notNull().default(1),
  targetMode: mysqlEnum("targetMode", ["mock", "groq"]).notNull().default("mock"),
  promptVersion: varchar("promptVersion", { length: 80 }).notNull().default("v1.0.0"),
  totalAttacks: int("totalAttacks").notNull().default(0),
  passedCount: int("passedCount").notNull().default(0),
  blockedCount: int("blockedCount").notNull().default(0),
  failedCount: int("failedCount").notNull().default(0),
  effectiveness: int("effectiveness").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const testbedResults = mysqlTable("testbed_results", {
  id: int("id").autoincrement().primaryKey(),
  runId: varchar("runId", { length: 64 }).notNull(),
  attackId: varchar("attackId", { length: 80 }).notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).notNull(),
  input: text("input").notNull(),
  response: text("response").notNull(),
  inputBlocked: int("inputBlocked").notNull().default(0),
  outputBlocked: int("outputBlocked").notNull().default(0),
  passed: int("passed").notNull().default(0),
  reason: varchar("reason", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type TestbedRun = typeof testbedRuns.$inferSelect;
export type InsertTestbedRun = typeof testbedRuns.$inferInsert;
export type TestbedResult = typeof testbedResults.$inferSelect;
export type InsertTestbedResult = typeof testbedResults.$inferInsert;
