// Burner accounts: no sign-in, the account is just its API key. Created on demand, funded with USDG.
import { randomBytes } from "crypto";
import { sql } from "./db";
import { createApiKey } from "./keys";

export const BURNER_PREFIX = "burner_";

export async function createBurner() {
  const userId = `${BURNER_PREFIX}${randomBytes(12).toString("hex")}`;
  return sql.begin(async (tx) => {
    await tx`INSERT INTO users (id) VALUES (${userId})`;
    return createApiKey(userId, "Burner", tx);
  });
}
