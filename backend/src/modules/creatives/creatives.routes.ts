import { Router, type Request, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../../middleware/auth";
import { CreativeListQuery, CreativeRange } from "../../contracts/creatives.contract";
import { getCreative, listCreatives } from "./creatives.service";

/** Read-only creative diagnosis API. No route here writes to Meta. */
const router = Router();
router.use(requireAuth);

router.get("/", async (req, res: Response) => {
  const parsed = CreativeListQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
  }
  res.json(await listCreatives((req as AuthedRequest).userId, parsed.data));
});

router.get("/:id", async (req: Request, res: Response) => {
  const range = CreativeRange.safeParse(req.query["range"] ?? "7d");
  if (!range.success) return res.status(400).json({ error: "range must be 7d, 14d or 30d" });
  const detail = await getCreative((req as AuthedRequest).userId, String(req.params["id"]), range.data);
  if (!detail) return res.status(404).json({ error: "Creative not found" });
  res.json(detail);
});

export default router;
