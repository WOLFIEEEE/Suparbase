import { describe, expect, it } from "vitest";
import { fingerprintRequest, isAiAgent } from "@/server/sentry/fingerprint";

/**
 * Fingerprinter unit tests. Every pattern we recognise is exercised
 * once, plus the negative paths (unknown UA / empty UA / generic AI
 * mention without a vendor match).
 */

describe("fingerprintRequest", () => {
  it("treats empty UA as unknown", () => {
    expect(fingerprintRequest(null)).toEqual({ kind: "unknown", label: "unknown" });
    expect(fingerprintRequest("")).toEqual({ kind: "unknown", label: "unknown" });
    expect(fingerprintRequest("   ")).toEqual({ kind: "unknown", label: "unknown" });
  });

  it("recognises Cursor with a version", () => {
    const fp = fingerprintRequest("Cursor/0.45.6 Electron/27.0.0");
    expect(fp.kind).toBe("cursor");
    expect(fp.label).toContain("0.45.6");
  });

  it("recognises Claude Code with a version", () => {
    const fp = fingerprintRequest("claude-code/1.2.3 (macos)");
    expect(fp.kind).toBe("claude_code");
    expect(fp.label).toContain("1.2.3");
  });

  it("recognises Claude Code without a version", () => {
    const fp = fingerprintRequest("Anthropic Claude Code (linux)");
    expect(fp.kind).toBe("claude_code");
    expect(fp.label).toBe("Claude Code");
  });

  it("recognises Replit Agent", () => {
    expect(fingerprintRequest("Replit-Agent/2.0").kind).toBe("replit_agent");
    expect(fingerprintRequest("Replit Agent (node 20)").kind).toBe("replit_agent");
  });

  it("recognises Lovable", () => {
    expect(fingerprintRequest("Lovable/build").kind).toBe("lovable");
    expect(fingerprintRequest("lovable.dev render").kind).toBe("lovable");
  });

  it("recognises v0 and v0-vercel", () => {
    expect(fingerprintRequest("v0/runtime").kind).toBe("v0");
    expect(fingerprintRequest("v0-vercel").kind).toBe("v0");
  });

  it("recognises Vercel AI SDK", () => {
    expect(fingerprintRequest("vercel-ai-sdk/3.1.0").kind).toBe("vercel_ai_sdk");
    expect(fingerprintRequest("ai-sdk/2.0").kind).toBe("vercel_ai_sdk");
  });

  it("recognises OpenRouter", () => {
    expect(fingerprintRequest("openrouter.ai 1.0").kind).toBe("openrouter");
  });

  it("falls back to ai_unknown when UA mentions an LLM term but no vendor", () => {
    const fp = fingerprintRequest("MyTool/1.0 (anthropic-claude)");
    expect(fp.kind).toBe("ai_unknown");
    expect(fp.label.startsWith("AI · ")).toBe(true);
  });

  it("classifies a normal browser as browser", () => {
    const fp = fingerprintRequest(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0",
    );
    expect(fp.kind).toBe("browser");
  });

  it("classifies curl + node-fetch as cli", () => {
    expect(fingerprintRequest("curl/8.4.0").kind).toBe("cli");
    expect(fingerprintRequest("node-fetch/3.3.0").kind).toBe("cli");
    expect(fingerprintRequest("axios/1.6.0").kind).toBe("cli");
  });

  it("falls back to unknown for truly opaque UAs", () => {
    expect(fingerprintRequest("MyCustomAgent/0.1").kind).toBe("unknown");
  });

  it("identifies Aider from versioned UA", () => {
    const fp = fingerprintRequest("aider/0.40.0");
    expect(fp.kind).toBe("aider");
    expect(fp.label).toContain("Aider");
  });

  it("identifies Cline (and the older Claude Dev alias)", () => {
    expect(fingerprintRequest("cline/1.2.3").kind).toBe("cline");
    expect(fingerprintRequest("Claude-Dev/0.5.0 VSCode").kind).toBe("cline");
  });

  it("identifies Continue.dev", () => {
    expect(fingerprintRequest("continue-dev/0.9.250").kind).toBe("continue_dev");
    expect(fingerprintRequest("continue/0.9.250").kind).toBe("continue_dev");
  });

  it("identifies the v3.20 agent runtimes", () => {
    expect(fingerprintRequest("Windsurf/1.9.4 (darwin)")).toEqual({ kind: "windsurf", label: "Windsurf 1.9.4" });
    expect(fingerprintRequest("codex-cli/0.12.0").kind).toBe("codex");
    expect(fingerprintRequest("OpenAI-Codex agent").kind).toBe("codex");
    expect(fingerprintRequest("GitHub-Copilot/1.0 coding-agent")).toEqual({ kind: "copilot", label: "GitHub Copilot 1.0" });
    expect(fingerprintRequest("copilot-cli/0.3").kind).toBe("copilot");
    expect(fingerprintRequest("gemini-cli/0.4.1").kind).toBe("gemini_cli");
    expect(fingerprintRequest("Devin/2.1 (cognition)").kind).toBe("devin");
    expect(fingerprintRequest("bolt.new runtime").kind).toBe("bolt");
    expect(fingerprintRequest("Zed/0.170.3").label).toBe("Zed 0.170.3");
    expect(fingerprintRequest("sourcegraph-amp/0.2").kind).toBe("amp");
    expect(fingerprintRequest("Kiro-CLI/1.0").kind).toBe("kiro");
    expect(fingerprintRequest("opencode/0.5.2").label).toBe("OpenCode 0.5.2");
    expect(fingerprintRequest("Trae/1.3.0").kind).toBe("trae");
    expect(fingerprintRequest("JetBrains-Junie/2025.1").label).toBe("JetBrains Junie 2025.1");
  });

  it("does not bucket the bare words zed / trae without a version", () => {
    expect(fingerprintRequest("zed-networking/1.0").kind).toBe("unknown");
    expect(fingerprintRequest("Trae").kind).toBe("unknown");
  });

  it("still prefers Claude Code over the generic codex pattern", () => {
    expect(fingerprintRequest("claude-code/2.0.0").kind).toBe("claude_code");
  });
});

describe("isAiAgent", () => {
  it("returns true for known AI vendors", () => {
    expect(isAiAgent("cursor")).toBe(true);
    expect(isAiAgent("claude_code")).toBe(true);
    expect(isAiAgent("replit_agent")).toBe(true);
    expect(isAiAgent("lovable")).toBe(true);
    expect(isAiAgent("v0")).toBe(true);
    expect(isAiAgent("vercel_ai_sdk")).toBe(true);
    expect(isAiAgent("openrouter")).toBe(true);
    expect(isAiAgent("aider")).toBe(true);
    expect(isAiAgent("cline")).toBe(true);
    expect(isAiAgent("continue_dev")).toBe(true);
    expect(isAiAgent("windsurf")).toBe(true);
    expect(isAiAgent("codex")).toBe(true);
    expect(isAiAgent("junie")).toBe(true);
    expect(isAiAgent("ai_unknown")).toBe(true);
  });

  it("returns false for humans / opaque", () => {
    expect(isAiAgent("browser")).toBe(false);
    expect(isAiAgent("cli")).toBe(false);
    expect(isAiAgent("unknown")).toBe(false);
  });
});
