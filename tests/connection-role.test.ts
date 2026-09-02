import { describe, expect, it } from "vitest";
import { roleAtLeast } from "@/server/connections/repo";

describe("connection role hierarchy", () => {
  it("lets owners perform every role-scoped operation", () => {
    expect(roleAtLeast("owner", "owner")).toBe(true);
    expect(roleAtLeast("owner", "editor")).toBe(true);
    expect(roleAtLeast("owner", "viewer")).toBe(true);
  });

  it("lets editors read and write without owner-only administration", () => {
    expect(roleAtLeast("editor", "viewer")).toBe(true);
    expect(roleAtLeast("editor", "editor")).toBe(true);
    expect(roleAtLeast("editor", "owner")).toBe(false);
  });

  it("keeps viewers read-only", () => {
    expect(roleAtLeast("viewer", "viewer")).toBe(true);
    expect(roleAtLeast("viewer", "editor")).toBe(false);
    expect(roleAtLeast("viewer", "owner")).toBe(false);
  });
});
