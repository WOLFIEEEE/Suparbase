// Test-only stub for src/server/db. We never hit a real database from
// vitest — every test in this suite calls pure builders / validators.
// Anything that tries to read or write through `db` will throw, which
// is exactly what we want (forces the test to mock the call explicitly).

const trap = new Proxy(
  {},
  {
    get(_target, prop): never {
      throw new Error(
        `tests must not touch the real db (accessed db.${String(prop)})`,
      );
    },
  },
);

export const db = trap as unknown as { [k: string]: never };
