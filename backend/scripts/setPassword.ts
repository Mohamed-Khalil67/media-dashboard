/**
 * CLI password setter — bypass for when Firebase's hosted password-reset email
 * flow is unavailable (e.g. service-account IAM gap, missing email templates,
 * Admin SDK / Identity Platform quirks).
 *
 * Usage:
 *   npm run set-password -- <email> <new-password>
 *
 * Behaviour:
 *   - If a Firebase Auth user exists for <email>, the password is updated in place.
 *   - If not, the user is CREATED with that password (handy for first-time
 *     bootstrap when the operator's account doesn't exist yet).
 *   - The local AllowedEmail row is upserted so the new credentials work
 *     immediately on the next sign-in.
 *
 * Prints the resulting Firebase uid + role on success.
 */
import { prisma } from "../src/db/client";
import { firebaseAuth } from "../src/lib/firebase";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function usage(): never {
  console.error("Usage: npm run set-password -- <email> <new-password>");
  console.error("       (password must be at least 8 characters)");
  process.exit(2);
}

async function main(): Promise<void> {
  const [, , rawEmail, password, ...rest] = process.argv;
  if (!rawEmail || !password || rest.length > 0) usage();

  const email = rawEmail.toLowerCase().trim();
  if (!EMAIL_REGEX.test(email)) {
    console.error(`✕ "${rawEmail}" doesn't look like a valid email address.`);
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("✕ Password must be at least 8 characters.");
    process.exit(1);
  }

  const auth = firebaseAuth();
  let uid: string;
  let action: "updated" | "created";

  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, { password });
    uid = existing.uid;
    action = "updated";
  } catch (err: any) {
    if (err?.code !== "auth/user-not-found") throw err;
    const created = await auth.createUser({ email, password, emailVerified: true });
    uid = created.uid;
    action = "created";
  }

  // Keep the allowlist in sync so the credentials work on the very next sign-in.
  await prisma.allowedEmail.upsert({
    where: { email },
    update: {},
    create: { email, note: "Bootstrapped via set-password CLI" },
  });

  // If a local User row already exists with this email, link the firebaseUid.
  const localUser = await prisma.user.findUnique({ where: { email }, select: { id: true, firebaseUid: true, role: true } });
  if (localUser && localUser.firebaseUid !== uid) {
    await prisma.user.update({
      where: { id: localUser.id },
      data: { firebaseUid: uid, pendingMigration: false, passwordHash: null, disabled: false },
    });
  }

  console.log(`✓ Password ${action} for ${email}`);
  console.log(`  Firebase uid: ${uid}`);
  if (localUser) {
    console.log(`  Local User.role: ${localUser.role}`);
    if (localUser.role !== "admin") {
      console.log("  Tip: run `npm run allow:add -- " + email + " --role=admin` to promote.");
    }
  } else {
    console.log("  No local User row yet — it'll be auto-provisioned on first sign-in.");
    console.log("  To grant admin: sign in once, then `npm run allow:add -- " + email + " --role=admin`.");
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("✕ Failed:", err?.message ?? err);
  await prisma.$disconnect();
  process.exit(1);
});
