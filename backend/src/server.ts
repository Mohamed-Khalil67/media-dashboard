import "dotenv/config";
import { app } from "./app";
import { startSyncJobs } from "./jobs/sync.job";

const PORT = process.env.PORT ?? 3000;

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  if (process.env.DISABLE_CRON !== "true") {
    startSyncJobs();
  }
});
