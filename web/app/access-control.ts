import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { allowedUsers } from "../db/schema";

export const ADMIN_EMAIL = "minato675@gmail.com";

export function normalizeEmail(email: string) {
  return email.trim().toLocaleLowerCase();
}

export function isAdminEmail(email: string) {
  return normalizeEmail(email) === ADMIN_EMAIL;
}

export async function isAllowedEmail(email: string) {
  const normalized = normalizeEmail(email);
  if (isAdminEmail(normalized)) return true;
  const [entry] = await getDb().select().from(allowedUsers).where(eq(allowedUsers.email, normalized)).limit(1);
  return Boolean(entry?.enabled);
}
