import { Router, Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "../../db/client";
import { logger } from "../../lib/logger";

const router = Router();

interface SignedRequestPayload {
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
}

/**
 * Facebook signed_request: base64url(signature).base64url(JSON payload), HMAC-SHA256 over the
 * raw payload segment using FB_APP_SECRET. Spec: developers.facebook.com/docs/facebook-login/data-deletion-callback
 */
function parseSignedRequest(signedRequest: string, secret: string): SignedRequestPayload | null {
  const [sigPart, payloadPart] = signedRequest.split(".");
  if (!sigPart || !payloadPart) return null;
  const expected = crypto.createHmac("sha256", secret).update(payloadPart).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(sigPart.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  } catch {
    return null;
  }
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return null;
  try {
    const json = Buffer.from(payloadPart.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const parsed = JSON.parse(json) as SignedRequestPayload;
    if (parsed.algorithm !== "HMAC-SHA256") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function revokeConnectionsByFacebookUid(facebookUid: string): Promise<number> {
  const identities = await prisma.identity.findMany({
    where: { provider: "facebook", providerId: facebookUid },
    select: { userId: true },
  });
  if (identities.length === 0) return 0;
  const userIds = identities.map((i) => i.userId);
  const result = await prisma.connection.updateMany({
    where: { userId: { in: userIds }, platform: "facebook" },
    data: { status: "revoked", accessToken: "" },
  });
  return result.count;
}

/** Facebook calls this when a user removes the app from their account. */
router.post("/deauth", async (req: Request, res: Response) => {
  const signed = (req.body?.signed_request ?? "") as string;
  const secret = process.env.FB_APP_SECRET ?? "";
  if (!signed || !secret) {
    return res.status(400).json({ error: "Missing signed_request" });
  }
  const payload = parseSignedRequest(signed, secret);
  if (!payload?.user_id) {
    logger.warn({ ip: req.ip }, "facebook deauth: invalid signature");
    return res.status(401).json({ error: "Invalid signature" });
  }

  try {
    const count = await revokeConnectionsByFacebookUid(payload.user_id);
    logger.info({ fbUid: payload.user_id, revoked: count }, "facebook deauth processed");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, fbUid: payload.user_id }, "facebook deauth failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/** Facebook calls this when a user requests their data be deleted. Must return url + confirmation_code. */
router.post("/data-deletion", async (req: Request, res: Response) => {
  const signed = (req.body?.signed_request ?? "") as string;
  const secret = process.env.FB_APP_SECRET ?? "";
  if (!signed || !secret) {
    return res.status(400).json({ error: "Missing signed_request" });
  }
  const payload = parseSignedRequest(signed, secret);
  if (!payload?.user_id) {
    logger.warn({ ip: req.ip }, "facebook data-deletion: invalid signature");
    return res.status(401).json({ error: "Invalid signature" });
  }

  const confirmationCode = crypto.randomBytes(16).toString("hex");
  try {
    const count = await revokeConnectionsByFacebookUid(payload.user_id);
    logger.info({ fbUid: payload.user_id, confirmationCode, revoked: count }, "facebook data-deletion processed");
    // FB requires a stable status URL the user can visit to check progress. We use a static page.
    const statusUrl = `${process.env.FRONTEND_URL ?? ""}/data-deletion?code=${confirmationCode}`;
    res.json({ url: statusUrl, confirmation_code: confirmationCode });
  } catch (err) {
    logger.error({ err, fbUid: payload.user_id }, "facebook data-deletion failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
