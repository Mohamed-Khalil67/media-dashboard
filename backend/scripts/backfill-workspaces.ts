/**
 * One-off backfill: convert existing User-owned data to Workspace-owned data.
 *
 * For each existing User without an activeWorkspaceId:
 *  1. Create a default Workspace named "{name or email}'s workspace".
 *  2. Add the user as the workspace owner.
 *  3. Set User.activeWorkspaceId to this workspace.
 *  4. Move all of the user's Connections + AlertRules into this workspace.
 *
 * Idempotent — safe to re-run; users already migrated are skipped.
 *
 * Run:
 *   cd backend && npx ts-node-dev --transpile-only scripts/backfill-workspaces.ts
 */
import { prisma } from "../src/db/client";

async function main() {
  const users = await prisma.user.findMany({
    where: { activeWorkspaceId: null },
    select: { id: true, name: true, email: true },
  });

  console.log(`Found ${users.length} users without a workspace. Backfilling…`);

  for (const u of users) {
    const wsName = u.name ? `${u.name}'s workspace` : `${u.email}'s workspace`;
    const ws = await prisma.workspace.create({ data: { name: wsName } });

    await prisma.workspaceMember.create({
      data: { workspaceId: ws.id, userId: u.id, role: "owner" },
    });

    await prisma.user.update({
      where: { id: u.id },
      data: { activeWorkspaceId: ws.id },
    });

    const connRes = await prisma.connection.updateMany({
      where: { userId: u.id, workspaceId: null },
      data: { workspaceId: ws.id },
    });

    const ruleRes = await prisma.alertRule.updateMany({
      where: { userId: u.id, workspaceId: null },
      data: { workspaceId: ws.id },
    });

    console.log(
      `→ User ${u.email}: workspace ${ws.id}, moved ${connRes.count} connections, ${ruleRes.count} alert rules`,
    );
  }

  // Catch any stragglers (orphan rows from older test data, etc).
  const orphanConns = await prisma.connection.count({ where: { workspaceId: null } });
  const orphanRules = await prisma.alertRule.count({ where: { workspaceId: null } });
  if (orphanConns > 0 || orphanRules > 0) {
    console.warn(`⚠ Still ${orphanConns} connections and ${orphanRules} alert rules without a workspace.`);
    console.warn("   Their owner Users may already have activeWorkspaceId set but the rows weren't moved.");
    console.warn("   Run the script again or inspect manually.");
  } else {
    console.log("✓ All connections and alert rules now belong to a workspace.");
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
