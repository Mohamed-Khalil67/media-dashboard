-- 7.1 cleanup: User.plan and User.stripeCustomerId were never written or read.
-- Stripe integration was deferred indefinitely; dropping the orphan columns
-- so the schema reflects only what the app actually uses.

ALTER TABLE "User" DROP COLUMN IF EXISTS "plan";
ALTER TABLE "User" DROP COLUMN IF EXISTS "stripeCustomerId";
