import type { Express, Request, Response } from "express";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { attackLibrary } from "./guardrails/attack-library";
import { checkInput } from "./guardrails/engine";
import { getRunDetails, runAttackSuite } from "./guardrails/runner";
import { listTestbedRuns } from "./db";

/** Look up attack name by id so persisted results always carry a human label. */
const attackNameById = Object.fromEntries(attackLibrary.map(a => [a.id, a.name]));

function enrichResults(results: Array<Record<string, unknown>>) {
  return results.map(r => ({
    ...r,
    attackName: (r.attackName as string | undefined) ?? attackNameById[r.attackId as string] ?? r.attackId,
  }));
}

const ENV_FILE = resolve(process.cwd(), ".env");

/** Read the current .env file into a key→value map. */
function readEnvFile(): Record<string, string> {
  try {
    const lines = readFileSync(ENV_FILE, "utf8").split("\n");
    const map: Record<string, string> = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      map[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    }
    return map;
  } catch {
    return {};
  }
}

/** Write a key→value map back to the .env file, preserving comments. */
function writeEnvFile(updates: Record<string, string | undefined>) {
  try {
    let lines: string[] = [];
    try {
      lines = readFileSync(ENV_FILE, "utf8").split("\n");
    } catch {
      lines = [];
    }

    const written = new Set<string>();

    // Update existing lines in place
    const updated = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;
      const eq = trimmed.indexOf("=");
      if (eq === -1) return line;
      const key = trimmed.slice(0, eq).trim();
      if (key in updates) {
        written.add(key);
        const val = updates[key];
        if (val === undefined) return null; // mark for deletion
        return `${key}=${val}`;
      }
      return line;
    }).filter((l): l is string => l !== null);

    // Append any new keys that didn't exist yet
    for (const [key, val] of Object.entries(updates)) {
      if (!written.has(key) && val !== undefined) {
        updated.push(`${key}=${val}`);
      }
    }

    writeFileSync(ENV_FILE, updated.join("\n"), "utf8");
  } catch (err) {
    console.warn("[Config] Could not write .env file:", err);
  }
}

const runSchema = z.object({
  label: z.string().max(120).optional(),
  guardrailsEnabled: z.boolean().optional(),
  targetMode: z.enum(["mock", "groq", "custom"]).optional(),
  targetEndpoint: z.string().url().optional(),
  targetAuth: z.string().max(512).optional(),
  promptVersion: z.string().max(80).optional(),
  attackIds: z.array(z.string()).max(30).optional(),
  useLlmClassifier: z.boolean().optional(),
});

export function registerTestbedRoutes(app: Express) {
  app.get("/api/testbed/library", (_req, res) => {
    res.json({ attacks: attackLibrary, count: attackLibrary.length });
  });

  // ── Runtime config: read and write environment settings ──────────────────
  app.get("/api/config", (_req, res) => {
    res.json({
      groqKeySet: Boolean(process.env.GROQ_API_KEY),
      groqModel: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
      enableLlmClassifier: process.env.ENABLE_LLM_CLASSIFIER === "true",
    });
  });

  app.post("/api/config", (req: Request, res: Response) => {
    const { groqApiKey, groqModel, enableLlmClassifier } = req.body ?? {};
    const envUpdates: Record<string, string | undefined> = {};

    if (typeof groqApiKey === "string") {
      if (groqApiKey.trim()) {
        process.env.GROQ_API_KEY = groqApiKey.trim();
        envUpdates.GROQ_API_KEY = groqApiKey.trim();
      } else {
        delete process.env.GROQ_API_KEY;
        envUpdates.GROQ_API_KEY = undefined;
      }
    }
    if (typeof groqModel === "string" && groqModel.trim()) {
      process.env.GROQ_MODEL = groqModel.trim();
      envUpdates.GROQ_MODEL = groqModel.trim();
    }
    if (typeof enableLlmClassifier === "boolean") {
      process.env.ENABLE_LLM_CLASSIFIER = enableLlmClassifier ? "true" : "false";
      envUpdates.ENABLE_LLM_CLASSIFIER = enableLlmClassifier ? "true" : "false";
    }

    // Persist to .env so settings survive server restarts
    if (Object.keys(envUpdates).length > 0) {
      writeEnvFile(envUpdates);
    }

    res.json({
      groqKeySet: Boolean(process.env.GROQ_API_KEY),
      groqModel: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
      enableLlmClassifier: process.env.ENABLE_LLM_CLASSIFIER === "true",
    });
  });

  // ── Live Groq model list (proxied so the API key stays server-side) ───────
  app.get("/api/groq/models", async (_req, res: Response) => {
    if (!process.env.GROQ_API_KEY) {
      return res.json({ models: [] });
    }
    try {
      const r = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      });
      if (!r.ok) return res.json({ models: [] });
      const data = await r.json() as { data?: Array<{ id: string; owned_by?: string }> };
      // Only return chat-capable models (exclude audio/guard/embedding models)
      const chatModels = (data.data ?? [])
        .map(m => m.id)
        .filter(id => !id.includes("whisper") && !id.includes("guard") && !id.includes("tts"))
        .sort();
      res.json({ models: chatModels });
    } catch {
      res.json({ models: [] });
    }
  });

  app.post("/api/guardrails/check", async (req: Request, res: Response) => {
    const input = typeof req.body?.input === "string" ? req.body.input : "";
    if (!input.trim()) return res.status(400).json({ safe: false, reason: "input is required" });
    const result = await checkInput(input, { useLlm: Boolean(req.body?.useLlmClassifier) });
    res.json(result);
  });

  app.post("/api/testbed/run", async (req: Request, res: Response) => {
    const parsed = runSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid run configuration", details: parsed.error.flatten() });
    try {
      const result = await runAttackSuite(parsed.data);
      res.json({ ...result, results: enrichResults(result.results as unknown as Array<Record<string, unknown>>) });
    } catch (error) {
      console.error("[Testbed] run failed", error);
      res.status(500).json({ error: "Test run failed" });
    }
  });

  app.get("/api/testbed/results", async (req: Request, res: Response) => {
    const runId = typeof req.query.runId === "string" ? req.query.runId : undefined;
    if (runId) {
      const detail = await getRunDetails(runId);
      return res.json({ ...detail, results: enrichResults(detail.results as unknown as Array<Record<string, unknown>>) });
    }
    res.json({ runs: await listTestbedRuns(20) });
  });
}
