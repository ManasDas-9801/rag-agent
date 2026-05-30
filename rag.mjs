#!/usr/bin/env node
/**
 * RAG Agent dev CLI — cross-platform (Windows + macOS + Linux)
 * Usage: node rag.mjs <command>   or   ./rag <command>   or   rag.cmd <command>
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.join(ROOT, ".rag");
const PID_FILE = path.join(STATE_DIR, "pids.json");
const isWin = process.platform === "win32";

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

function log(msg, color = "") {
  console.log(color ? `${color}${msg}${COLORS.reset}` : msg);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: isWin,
    env: process.env,
    ...opts,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function npm(args) {
  run("npm", args);
}

function docker(args) {
  run("docker", ["compose", ...args]);
}

function ensureStateDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function loadPids() {
  try {
    return JSON.parse(fs.readFileSync(PID_FILE, "utf8"));
  } catch {
    return { processes: [] };
  }
}

function savePids(data) {
  ensureStateDir();
  fs.writeFileSync(PID_FILE, JSON.stringify(data, null, 2));
}

function spawnService(name, command, args) {
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    shell: isWin,
    env: process.env,
    detached: !isWin,
  });

  const prefix = `[${name}]`;
  child.stdout?.on("data", (d) => {
    for (const line of d.toString().split(/\r?\n/)) {
      if (line.trim()) log(`${prefix} ${line}`, COLORS.dim);
    }
  });
  child.stderr?.on("data", (d) => {
    for (const line of d.toString().split(/\r?\n/)) {
      if (line.trim()) log(`${prefix} ${line}`, COLORS.yellow);
    }
  });

  return { name, pid: child.pid, command, args };
}

function killPid(pid) {
  if (!pid) return;
  try {
    if (isWin) {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGTERM");
    }
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already dead */
    }
  }
}

function waitForDocker() {
  log("Waiting for Postgres & Redis…", COLORS.dim);
  for (let i = 0; i < 30; i++) {
    const pg = spawnSync(
      "docker",
      ["compose", "exec", "-T", "postgres", "pg_isready", "-U", "rag", "-d", "rag"],
      { cwd: ROOT, stdio: "ignore", shell: isWin },
    );
    const rd = spawnSync("docker", ["compose", "exec", "-T", "redis", "redis-cli", "ping"], {
      cwd: ROOT,
      stdio: "ignore",
      shell: isWin,
    });
    if (pg.status === 0 && rd.status === 0) return;
    if (isWin) {
      spawnSync("powershell", ["-Command", "Start-Sleep -Seconds 1"], { stdio: "ignore" });
    } else {
      spawnSync("sleep", ["1"], { stdio: "ignore" });
    }
  }
  log("Warning: health check timed out; continuing anyway.", COLORS.yellow);
}

const SERVICES = [
  { name: "api", command: "npm", args: ["run", "dev", "-w", "@rag/api"] },
  { name: "worker", command: "npm", args: ["run", "worker"] },
  { name: "web", command: "npm", args: ["run", "dev", "-w", "@rag/web"] },
  {
    name: "demo",
    command: "npx",
    args: ["--yes", "serve", "demo-site", "-p", "8080"],
  },
];

function cmdInstall() {
  log("Installing dependencies…", COLORS.cyan);
  npm(["install"]);
}

function cmdMigrate() {
  log("Running database migrations…", COLORS.cyan);
  npm(["run", "db:migrate"]);
}

function cmdStart() {
  const existing = loadPids();
  if (existing.processes?.length) {
    log("Dev processes may already be running. Run `./rag stop` first.", COLORS.yellow);
  }

  log("Starting Docker (postgres, redis)…", COLORS.cyan);
  docker(["up", "-d", "postgres", "redis"]);
  waitForDocker();

  log("Migrating database…", COLORS.cyan);
  npm(["run", "db:migrate"]);

  log("Starting API, worker, web, demo-site…", COLORS.cyan);
  const processes = SERVICES.map((s) => spawnService(s.name, s.command, s.args));
  savePids({ processes, startedAt: new Date().toISOString() });

  log("", COLORS.reset);
  log("RAG Agent is running:", COLORS.green);
  log("  API:       http://localhost:4000  (docs: /docs)");
  log("  Web:       http://localhost:3000");
  log("  Demo site: http://localhost:8080");
  log("  Worker:    ingestion (background)");
  log("");
  log("Stop everything: ./rag stop", COLORS.dim);
}

function cmdStop(withDocker = false) {
  const state = loadPids();
  if (state.processes?.length) {
    log("Stopping dev processes…", COLORS.cyan);
    for (const p of state.processes) {
      log(`  ${p.name} (pid ${p.pid})`, COLORS.dim);
      killPid(p.pid);
    }
    try {
      fs.unlinkSync(PID_FILE);
    } catch {
      /* ignore */
    }
  } else {
    log("No tracked dev processes (.rag/pids.json empty).", COLORS.dim);
  }

  if (withDocker) {
    log("Stopping Docker (postgres, redis)…", COLORS.cyan);
    docker(["stop", "postgres", "redis"]);
  }
}

function cmdStatus() {
  const state = loadPids();
  log("Docker:", COLORS.cyan);
  spawnSync("docker", ["compose", "ps", "postgres", "redis"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: isWin,
  });
  log("\nDev processes:", COLORS.cyan);
  if (!state.processes?.length) {
    log("  (none tracked — run ./rag start)", COLORS.dim);
    return;
  }
  for (const p of state.processes) {
    let alive = "?";
    try {
      process.kill(p.pid, 0);
      alive = "running";
    } catch {
      alive = "stopped";
    }
    log(`  ${p.name}: pid ${p.pid} — ${alive}`);
  }
  if (state.startedAt) log(`  started: ${state.startedAt}`, COLORS.dim);
}

function cmdPromote(args) {
  const email = args[0];
  if (!email) {
    log("Usage: ./rag promote <email> [--plan=free|pro|business]", COLORS.red);
    process.exit(1);
  }
  const planArg = args.find((a) => a.startsWith("--plan="));
  const npmArgs = ["run", "admin:promote", "-w", "@rag/api", "--", email];
  if (planArg) npmArgs.push(planArg);
  npm(npmArgs);
}

function cmdHelp() {
  log(`RAG Agent CLI — run from repo root

Commands:
  install          npm install
  migrate          npm run db:migrate  (alias: migarte)
  start            Docker + migrate + API + worker + web + demo (:8080)
  stop             Stop dev processes (add --docker to stop postgres/redis)
  status           Show Docker + tracked process status
  promote <email>  Make super admin  [--plan=pro]
  help             This message

Examples:
  ./rag install
  ./rag migrate
  ./rag start
  ./rag stop
  ./rag stop --docker
  ./rag promote you@example.com --plan=business

Windows: rag.cmd start   ·   Unix: chmod +x rag && ./rag start
`, COLORS.cyan);
}

const [command, ...rest] = process.argv.slice(2);
const cmd = command === "migarte" ? "migrate" : command;

switch (cmd) {
  case "install":
    cmdInstall();
    break;
  case "migrate":
    cmdMigrate();
    break;
  case "start":
    cmdStart();
    break;
  case "stop":
    cmdStop(rest.includes("--docker"));
    break;
  case "status":
    cmdStatus();
    break;
  case "promote":
    cmdPromote(rest);
    break;
  case "help":
  case "-h":
  case "--help":
  case undefined:
    cmdHelp();
    break;
  default:
    log(`Unknown command: ${command}`, COLORS.red);
    cmdHelp();
    process.exit(1);
}
