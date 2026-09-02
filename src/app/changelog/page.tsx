import type { Metadata } from "next";
import { readFileSync } from "fs";
import { join } from "path";
import Link from "next/link";
import { GitCommit } from "lucide-react";
import { PublicLayout } from "@/components/public/PublicLayout";
import { PageHeader, PageShell, Prose } from "@/components/public/sections";

export const metadata: Metadata = {
  title: "Changelog · Suparbase",
  description:
    "Every Suparbase release since v0.1. Each version corresponds to a spec-kit feature directory and a git tag.",
  alternates: { canonical: "/changelog" },
};

interface ParsedRelease {
  /** "v1.4.0" */
  version: string;
  /** ISO-ish date string. */
  date: string;
  /** "SQL playground" */
  title: string;
  /** Markdown body (between this heading and the next ## heading). */
  body: string;
}

function parseChangelog(): ParsedRelease[] {
  const raw = readFileSync(join(process.cwd(), "CHANGELOG.md"), "utf8");
  const releases: ParsedRelease[] = [];
  // Match `## v1.4.0 · 2026-05-14 · SQL playground` headers and their body.
  const re = /^##\s+(v\d+\.\d+\.\d+)\s+·\s+(\S+)\s+·\s+(.+?)\s*$/gm;
  const matches: Array<{ idx: number; len: number; m: RegExpExecArray }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    matches.push({ idx: m.index, len: m[0].length, m });
  }
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]!;
    const next = matches[i + 1];
    const start = cur.idx + cur.len;
    const end = next ? next.idx : raw.length;
    const body = raw.slice(start, end).trim();
    releases.push({
      version: cur.m[1]!,
      date: cur.m[2]!,
      title: cur.m[3]!,
      body,
    });
  }
  return releases;
}

function formatDate(iso: string): string {
  // ISO date like "2026-05-14" → "May 14, 2026"
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default async function ChangelogPage() {
  const releases = parseChangelog();
  return (
    <PublicLayout>
      <PageShell>
        <PageHeader
          eyebrow="Changelog"
          title="Every release, since v0.1."
          subtitle="Each version maps to a spec-kit feature directory and a git tag. Most recent first."
        />

        <ol className="mt-16 space-y-14">
          {releases.map((r) => (
            <li key={r.version} className="relative grid grid-cols-1 gap-6 md:grid-cols-[10rem_1fr] md:gap-10">
              <aside className="space-y-2 md:sticky md:top-20 md:self-start">
                <div className="inline-flex items-center gap-1.5 rounded-full border-accent/40 bg-accent/10 px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-accent">
                  <GitCommit className="h-2.5 w-2.5" aria-hidden />
                  {r.version}
                </div>
                <p className="font-mono text-[11px] text-fg-faint">{formatDate(r.date)}</p>
                <h2 className="font-display text-lg leading-tight">{r.title}</h2>
              </aside>

              <article className="min-w-0 border-l hairline pl-6 md:pl-8">
                <Prose>
                  <ReleaseBody markdown={r.body} />
                </Prose>
              </article>
            </li>
          ))}
        </ol>

        <div className="mt-20 rounded-lg border hairline bg-bg-raised/40 p-5 text-sm text-fg-muted">
          Each release lives at{" "}
          <code>specs/0XX-feature-name/spec.md</code> in the repo with its full design notes. The dates above are the
          tag dates; the spec markdown is committed in lockstep.{" "}
          <Link href="/about" className="text-accent hover:underline">
            More on the spec-kit workflow →
          </Link>
        </div>
      </PageShell>
    </PublicLayout>
  );
}

// ---------------------------------------------------------------------------
// Minimal markdown rendering for release bodies. We don't pull a full markdown
// library to keep the page server-side and dependency-free; instead we render
// the small markdown subset our CHANGELOG.md uses: paragraphs, bold (`**X**`),
// inline code (`` `x` ``), and unordered bullet lists.
// ---------------------------------------------------------------------------

function ReleaseBody({ markdown }: { markdown: string }) {
  const blocks = splitBlocks(markdown);
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === "list") {
          return (
            <ul key={i}>
              {b.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{renderInline(b.text)}</p>;
      })}
    </>
  );
}

type Block = { kind: "paragraph"; text: string } | { kind: "list"; items: string[] };

function splitBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.split("\n");
  let para: string[] = [];
  let list: string[] | null = null;

  const flushPara = () => {
    if (para.length) {
      blocks.push({ kind: "paragraph", text: para.join(" ").trim() });
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ kind: "list", items: list });
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flushPara();
      list = list ?? [];
      list.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }
    if (list) {
      // continuation of the previous list item
      list[list.length - 1] = list[list.length - 1] + " " + line;
      continue;
    }
    para.push(line);
  }
  flushPara();
  flushList();
  return blocks;
}

function renderInline(text: string): React.ReactNode {
  // Tokenise `code`, **bold**, [link](url) into segments.
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i) {
        out.push(<code key={key++}>{text.slice(i + 1, end)}</code>);
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "*" && text[i + 1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end > i) {
        out.push(<strong key={key++}>{text.slice(i + 2, end)}</strong>);
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "[") {
      const close = text.indexOf("](", i + 1);
      if (close > i) {
        const endParen = text.indexOf(")", close + 2);
        if (endParen > close) {
          const label = text.slice(i + 1, close);
          const href = text.slice(close + 2, endParen);
          out.push(
            <a key={key++} href={href} target="_blank" rel="noopener noreferrer">
              {label}
            </a>,
          );
          i = endParen + 1;
          continue;
        }
      }
    }
    // Plain run of text until the next special char.
    const next = nextSpecial(text, i + 1);
    out.push(<span key={key++}>{text.slice(i, next)}</span>);
    i = next;
  }
  return out;
}

function nextSpecial(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (c === "`" || c === "[") return i;
    if (c === "*" && text[i + 1] === "*") return i;
  }
  return text.length;
}
