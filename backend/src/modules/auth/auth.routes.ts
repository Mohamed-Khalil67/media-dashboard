import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../db/client";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { seedDefaultRules } from "../alerts/alerts.service";

const router = Router();

const TOKEN_EXPIRY = "7d";
const BCRYPT_COST = 12;

function signToken(userId: string): string {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: TOKEN_EXPIRY });
}

router.post("/register", async (req: Request, res: Response) => {
  const { email, password, name } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "email and password (min 8 chars) are required" });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "Email already in use" });

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const user = await prisma.user.create({
    data: { email, passwordHash, name: typeof name === "string" ? name : null },
  });
  await seedDefaultRules(user.id);

  res.status(201).json({
    token: signToken(user.id),
    user: { id: user.id, email: user.email, name: user.name, plan: user.plan },
  });
});

router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "email and password are required" });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  res.json({
    token: signToken(user.id),
    user: { id: user.id, email: user.email, name: user.name, plan: user.plan },
  });
});

router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, plan: true, createdAt: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});

export default router;
