import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

function findEnvFile(startDir: string): string | null {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 12; i++) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Resolve `.env` by walking up from `process.cwd()` and from this file's directory
 * (npm `-w @rag/api` often sets cwd to `apps/api`, so repo root `.env` is one level up).
 */
export function loadEnvFiles() {
  const seen = new Set<string>();
  const starts = [
    process.cwd(),
    path.dirname(fileURLToPath(import.meta.url)),
  ];
  for (const start of starts) {
    const envPath = findEnvFile(start);
    if (envPath && !seen.has(envPath)) {
      seen.add(envPath);
      dotenv.config({ path: envPath, override: true });
    }
  }
}
