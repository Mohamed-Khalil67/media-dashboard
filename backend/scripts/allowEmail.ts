/**
 * Strict allowlist management for sign-ins.
 *
 * Usage:
 *   npm run allow:add    -- user@example.com [optional note] [--role=admin|media_buyer|client]
 *   npm run allow:remove -- user@example.com
 *   npm run allow:list
 *
 * Emails are always lowercased. The script is idempotent — adding an existing
 * email just updates its note. The optional --role flag also upserts the
 * matching User row's role (useful for self-bootstrapping to admin without
 * Prisma Studio).
 */
import { prisma } from "../src/db/client";

type Command = "add" | "remove" | "list";
const VALID_ROLES = ["admin", "media_buyer", "client"] as const;
type Role = typeof VALID_ROLES[number];

function usage(): never {
  console.error("Usage:");
  console.error("  npm run allow:add    -- <email> [note] [--role=admin|media_buyer|client]");
  console.error("  npm run allow:remove -- <email>");
  console.error("  npm run allow:list");
  process.exit(2);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseRole(args: string[]): { role: Role | null; rest: string[] } {
  let role: Role | null = null;
  const rest: string[] = [];
  for (const arg of args) {
    const match = /^--role=(.+)$/.exec(arg);
    if (match) {
      const value = match[1];
      if ((VALID_ROLES as readonly string[]).includes(value)) {
        role = value as Role;
      } else {
        console.error(`✕ "${value}" is not a valid role. Use one of: ${VALID_ROLES.join(", ")}`);
        process.exit(1);
      }
    } else {
      rest.push(arg);
    }
  }
  return { role, rest };
}

async function add(email: string, note: string | undefined, role: Role | null): Promise<void> {
  if (!isValidEmail(email)) {
    console.error(`✕ "${email}" doesn't look like a valid email address.`);
    process.exit(1);
  }
  const row = await prisma.allowedEmail.upsert({
    where: { email },
    update: { note: note ?? null },
    create: { email, note: note ?? null },
  });
  console.log(`✓ Allowed: ${row.email}${row.note ? ` (${row.note})` : ""}`);

  if (role) {
    const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existingUser) {
      await prisma.user.update({ where: { id: existingUser.id }, data: { role, disabled: false } });
      console.log(`  ↳ User role set to "${role}" (and enabled).`);
    } else {
      console.log(`  ↳ No User row yet — role "${role}" will apply when they first sign in.`);
      console.log(`     Tip: provision via the admin UI to set the role at creation time.`);
    }
  }
}

async function remove(email: string): Promise<void> {
  const existing = await prisma.allowedEmail.findUnique({ where: { email } });
  if (!existing) {
    console.log(`(nothing to remove — ${email} was not on the allowlist)`);
    return;
  }
  await prisma.allowedEmail.delete({ where: { email } });
  console.log(`✓ Revoked: ${email}`);
}

async function list(): Promise<void> {
  const rows = await prisma.allowedEmail.findMany({ orderBy: { createdAt: "asc" } });
  if (rows.length === 0) {
    console.log("(allowlist is empty — nobody can sign in until you add an email)");
    return;
  }
  console.log(`Allowlist (${rows.length} entr${rows.length === 1 ? "y" : "ies"}):`);
  for (const r of rows) {
    const when = r.createdAt.toISOString().slice(0, 10);
    console.log(`  ${r.email.padEnd(40)}  ${when}${r.note ? `  — ${r.note}` : ""}`);
  }
}

async function main(): Promise<void> {
  const [, , rawCmd, rawEmail, ...rest] = process.argv;
  const cmd = (rawCmd ?? "").toLowerCase() as Command | "";

  try {
    if (cmd === "list") {
      await list();
      return;
    }

    if (cmd !== "add" && cmd !== "remove") usage();

    if (!rawEmail) {
      console.error(`✕ "${cmd}" requires an email argument.`);
      usage();
    }
    const email = rawEmail.toLowerCase().trim();
    const { role, rest: noteParts } = parseRole(rest);

    if (cmd === "add") {
      const note = noteParts.length > 0 ? noteParts.join(" ") : undefined;
      await add(email, note, role);
    } else {
      await remove(email);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
