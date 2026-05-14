"use client";

/**
 * Tiny markdown renderer for AI chat answers. Supports:
 *   - ```fenced code blocks``` (with copy button)
 *   - **bold**, `inline code`, [links](href)
 *   - bullet lists (- ... / * ...)
 *   - paragraphs separated by blank lines
 *
 * Intentionally hand-written: avoids pulling react-markdown for a tight,
 * trusted surface (text comes from our own server which we control).
 */

import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/ui/cn";

type Block =
  | { kind: "code"; lang: string; text: string }
  | { kind: "para"; text: string }
  | { kind: "list"; items: string[] };

function parse(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.split("\n");
  let i = 0;
  let paraBuf: string[] = [];
  let listBuf: string[] = [];

  const flushPara = () => {
    if (paraBuf.length > 0) {
      blocks.push({ kind: "para", text: paraBuf.join(" ") });
      paraBuf = [];
    }
  };
  const flushList = () => {
    if (listBuf.length > 0) {
      blocks.push({ kind: "list", items: listBuf });
      listBuf = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    // Fenced code block.
    if (trimmed.startsWith("```")) {
      flushPara();
      flushList();
      const lang = trimmed.slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
        buf.push(lines[i] ?? "");
        i++;
      }
      // Skip the closing ``` if present.
      if (i < lines.length) i++;
      blocks.push({ kind: "code", lang, text: buf.join("\n") });
      continue;
    }

    // Blank line: paragraph break.
    if (trimmed === "") {
      flushPara();
      flushList();
      i++;
      continue;
    }

    // List item.
    const listMatch = /^\s*[-*]\s+(.*)$/.exec(line);
    if (listMatch) {
      flushPara();
      listBuf.push(listMatch[1] ?? "");
      i++;
      continue;
    }

    // Paragraph text.
    flushList();
    paraBuf.push(trimmed);
    i++;
  }
  flushPara();
  flushList();
  return blocks;
}

function renderInline(text: string): ReactNode {
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i) {
        out.push(
          <code
            key={key++}
            className="rounded bg-bg-sunken px-1 py-0.5 font-mono text-[0.85em] text-fg"
          >
            {text.slice(i + 1, end)}
          </code>,
        );
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "*" && text[i + 1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end > i) {
        out.push(
          <strong key={key++} className="font-semibold">
            {text.slice(i + 2, end)}
          </strong>,
        );
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
            <a
              key={key++}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline-offset-2 hover:underline"
            >
              {label}
            </a>,
          );
          i = endParen + 1;
          continue;
        }
      }
    }
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

function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="my-2 min-w-0 overflow-hidden rounded-md border hairline bg-bg-sunken">
      <div className="flex items-center justify-between border-b hairline px-2.5 py-1 text-[10px] text-fg-faint">
        <span className="font-mono uppercase tracking-[0.12em]">{lang || "code"}</span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-fg-muted hover:bg-bg-raised hover:text-fg"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" aria-hidden /> copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" aria-hidden /> copy
            </>
          )}
        </button>
      </div>
      <pre className="max-h-[20rem] overflow-auto px-2.5 py-2 font-mono text-[11px] leading-relaxed text-fg">
        <code>{text}</code>
      </pre>
    </div>
  );
}

export function ChatMarkdown({ source, className }: { source: string; className?: string }) {
  const blocks = parse(source);
  return (
    <div className={cn("space-y-2 text-sm leading-relaxed text-fg", className)}>
      {blocks.map((b, i) => {
        if (b.kind === "code") return <CodeBlock key={i} lang={b.lang} text={b.text} />;
        if (b.kind === "list") {
          return (
            <ul key={i} className="ml-4 list-disc space-y-1">
              {b.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{renderInline(b.text)}</p>;
      })}
    </div>
  );
}
