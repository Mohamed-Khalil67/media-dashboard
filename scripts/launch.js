#!/usr/bin/env node

/**
 * Local Development Launcher for Media Buying Dashboard
 * Spawns both Backend (Express/Prisma on port 3000) and Frontend (Angular on port 4200)
 * with unified log output and graceful shutdown handling.
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';
const npxCmd = isWindows ? 'npx.cmd' : 'npx';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
};

function log(prefix, color, message) {
  const lines = message.toString().split(/\r?\n/);
  for (const line of lines) {
    if (line.trim().length > 0) {
      console.log(`${color}[${prefix}]${colors.reset} ${line}`);
    }
  }
}

console.log(`${colors.bold}${colors.cyan}====================================================${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}   Media Buying Dashboard — Local Dev Environment    ${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}====================================================${colors.reset}\n`);

// 0. Install dependencies on a fresh checkout. The root package has no
// workspaces, so backend/ and frontend/ each need their own install.
for (const [name, dir] of [['backend', BACKEND_DIR], ['frontend', FRONTEND_DIR]]) {
  if (!fs.existsSync(path.join(dir, 'node_modules'))) {
    console.log(`${colors.yellow}[SETUP] ${name}/node_modules missing. Running npm ci (first run only)...${colors.reset}`);
    try {
      execSync(`${npmCmd} ci`, { cwd: dir, stdio: 'inherit' });
    } catch {
      console.error(`${colors.red}[SETUP] npm ci failed in ${name}/. Fix the error above, then run npm run dev again.${colors.reset}`);
      process.exit(1);
    }
  }
}

// 1. Check backend .env
const envFile = path.join(BACKEND_DIR, '.env');
const envExample = path.join(BACKEND_DIR, '.env.example');

if (!fs.existsSync(envFile)) {
  if (fs.existsSync(envExample)) {
    console.log(`${colors.yellow}[SETUP] backend/.env missing. Creating from .env.example...${colors.reset}`);
    fs.copyFileSync(envExample, envFile);
    console.log(`${colors.yellow}[SETUP] Please configure your DATABASE_URL and secrets in backend/.env${colors.reset}\n`);
  } else {
    console.warn(`${colors.yellow}[SETUP] Warning: backend/.env not found.${colors.reset}\n`);
  }
}

// 2. Ensure Prisma client is generated
try {
  console.log(`${colors.gray}[PRISMA] Ensuring Prisma client is up to date...${colors.reset}`);
  execSync(`${npxCmd} prisma generate`, { cwd: BACKEND_DIR, stdio: 'ignore' });
  console.log(`${colors.green}[PRISMA] Prisma client ready.${colors.reset}\n`);
} catch (err) {
  console.warn(`${colors.yellow}[PRISMA] Warning: could not run prisma generate (${err.message}). Proceeding...${colors.reset}\n`);
}

// 3. Start Backend
console.log(`${colors.green}[LAUNCH] Starting Backend (Express/Prisma on http://localhost:3000)...${colors.reset}`);
const backend = spawn(npmCmd, ['run', 'dev'], {
  cwd: BACKEND_DIR,
  env: { ...process.env, PORT: process.env.PORT || '3000' },
  shell: true,
});

backend.stdout.on('data', (d) => log('BACKEND', colors.green, d));
backend.stderr.on('data', (d) => log('BACKEND', colors.red, d));

// 4. Start Frontend
console.log(`${colors.magenta}[LAUNCH] Starting Frontend (Angular 21 on http://localhost:4200)...${colors.reset}`);
const frontend = spawn(npmCmd, ['start'], {
  cwd: FRONTEND_DIR,
  shell: true,
});

frontend.stdout.on('data', (d) => log('FRONTEND', colors.magenta, d));
frontend.stderr.on('data', (d) => log('FRONTEND', colors.red, d));

// 5. Handle Shutdown
function shutdown() {
  console.log(`\n${colors.yellow}[SHUTDOWN] Terminating frontend and backend processes...${colors.reset}`);
  if (isWindows) {
    if (backend.pid) spawn('taskkill', ['/pid', backend.pid.toString(), '/f', '/t']);
    if (frontend.pid) spawn('taskkill', ['/pid', frontend.pid.toString(), '/f', '/t']);
  } else {
    backend.kill('SIGINT');
    frontend.kill('SIGINT');
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

backend.on('close', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`${colors.red}[BACKEND] Process exited with code ${code}${colors.reset}`);
  }
});

frontend.on('close', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`${colors.red}[FRONTEND] Process exited with code ${code}${colors.reset}`);
  }
});
