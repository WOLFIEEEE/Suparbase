import "server-only";
import bcrypt from "bcryptjs";

const COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    // Run a dummy compare so timing doesn't differentiate "user does not exist"
    // from "user exists but has no password set".
    await bcrypt.compare("a", "$2a$12$qVNcm1KxBwQF2VbR0a2D5O3K7m4mZcGZxOpsvg7tBYsZl1zXFp1Tu");
    return false;
  }
  return bcrypt.compare(plain, hash);
}
