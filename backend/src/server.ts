import "dotenv/config";
import { app } from "./app";
import { startSyncJobs } from "./jobs/sync.job";
import { ensureBootstrapAdmin } from "./lib/bootstrapAdmin";
import { logger } from "./lib/logger";

const PORT = process.env.PORT ?? 3000;

async function start() {
  // Promote the bootstrap admin (if configured) BEFORE we open the port —
  // otherwise the admin could sign in during the ~ms window between
  // listen() and the promotion completing, and the auth middleware would
  // provision them as a default-role "client".
  await ensureBootstrapAdmin();
  app.listen(PORT, () => {
    logger.info({ port: PORT }, "API listening");
    if (process.env.DISABLE_CRON !== "true") {
      startSyncJobs();
    }
  });
}

start();
