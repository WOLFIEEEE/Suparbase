import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { users } from "@/server/schema/auth";
import { hashPassword } from "./passwords";

export const SignupSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12, "Password must be at least 12 characters").max(200),
});

export type SignupInput = z.infer<typeof SignupSchema>;

export class SignupError extends Error {
  code: "email_taken" | "validation" | "server";
  field?: string;
  constructor(code: SignupError["code"], message: string, field?: string) {
    super(message);
    this.code = code;
    this.field = field;
  }
}

export async function createUserAccount(input: SignupInput) {
  // Pre-check uniqueness (case-insensitive).
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${input.email}`)
    .limit(1);
  if (existing.length > 0) {
    throw new SignupError(
      "email_taken",
      "An account with this email already exists. Sign in, or use forgot-password if you haven't set one yet.",
      "email",
    );
  }

  const passwordHash = await hashPassword(input.password);
  const [row] = await db
    .insert(users)
    .values({
      name: input.name ?? null,
      email: input.email,
      passwordHash,
    })
    .returning();
  if (!row) throw new SignupError("server", "Could not create account.");
  return {
    id: row.id,
    email: row.email ?? input.email,
    name: row.name ?? null,
    image: row.image ?? null,
  };
}
