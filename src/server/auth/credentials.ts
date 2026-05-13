import "server-only";
import { eq, sql } from "drizzle-orm";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { db } from "@/server/db";
import { users } from "@/server/schema/auth";
import { verifyPassword } from "./passwords";

const CredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export const credentialsProvider = Credentials({
  name: "Email and password",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" },
  },
  async authorize(rawCredentials) {
    const parsed = CredentialsSchema.safeParse(rawCredentials);
    if (!parsed.success) return null;

    const { email, password } = parsed.data;
    // Case-insensitive lookup. We store email as the user typed it but
    // compare case-insensitively to avoid double-account bugs.
    const rows = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);
    const row = rows[0];
    const valid = await verifyPassword(password, row?.passwordHash ?? null);
    if (!row || !valid) return null;

    return {
      id: row.id,
      email: row.email ?? email,
      name: row.name ?? null,
      image: row.image ?? null,
    };
  },
});

// Suppress unused-import lint when used elsewhere.
void eq;
