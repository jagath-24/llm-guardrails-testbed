import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertTestbedResult, InsertTestbedRun, InsertUser, TestbedResult, TestbedRun, testbedResults, testbedRuns, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
const memoryRuns: TestbedRun[] = [];
const memoryResults: TestbedResult[] = [];
let memoryRunId = 1;
let memoryResultId = 1;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; }
  }
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function saveTestbedRun(run: InsertTestbedRun, results: InsertTestbedResult[]): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.insert(testbedRuns).values(run);
    if (results.length > 0) await db.insert(testbedResults).values(results);
    return;
  }
  const savedRun: TestbedRun = {
    id: memoryRunId++,
    runId: run.runId!,
    label: run.label!,
    guardrailsEnabled: run.guardrailsEnabled ?? 1,
    targetMode: run.targetMode ?? "mock",
    promptVersion: run.promptVersion ?? "v1.0.0",
    totalAttacks: run.totalAttacks ?? 0,
    passedCount: run.passedCount ?? 0,
    blockedCount: run.blockedCount ?? 0,
    failedCount: run.failedCount ?? 0,
    effectiveness: run.effectiveness ?? 0,
    createdAt: run.createdAt ?? new Date(),
  };
  memoryRuns.unshift(savedRun);
  for (const result of results) {
    memoryResults.unshift({
      id: memoryResultId++,
      runId: result.runId!, attackId: result.attackId!, category: result.category!, severity: result.severity!,
      input: result.input!, response: result.response!, inputBlocked: result.inputBlocked ?? 0,
      outputBlocked: result.outputBlocked ?? 0, passed: result.passed ?? 0, reason: result.reason!, createdAt: result.createdAt ?? new Date(),
    });
  }
}

export async function listTestbedRuns(limit = 20): Promise<TestbedRun[]> {
  const db = await getDb();
  if (!db) return memoryRuns.slice(0, limit);
  return db.select().from(testbedRuns).orderBy(desc(testbedRuns.createdAt)).limit(limit);
}

export async function getTestbedRun(runId: string): Promise<TestbedRun | undefined> {
  const db = await getDb();
  if (!db) return memoryRuns.find(run => run.runId === runId);
  const rows = await db.select().from(testbedRuns).where(eq(testbedRuns.runId, runId)).limit(1);
  return rows[0];
}

export async function listTestbedResults(runId: string): Promise<TestbedResult[]> {
  const db = await getDb();
  if (!db) return memoryResults.filter(result => result.runId === runId).reverse();
  return db.select().from(testbedResults).where(eq(testbedResults.runId, runId));
}
