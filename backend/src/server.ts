import "dotenv/config";
import { app } from "./app";
import { startSyncJobs } from "./jobs/sync.job";
import { logger } from "./lib/logger";

const PORT = process.env.PORT ?? 3000;

app.listen(PORT, () => {
  logger.info({ port: PORT }, "API listening");
  if (process.env.DISABLE_CRON !== "true") {
    startSyncJobs();
  }
});
