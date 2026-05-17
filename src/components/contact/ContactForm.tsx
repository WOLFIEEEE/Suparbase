"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT_TOPICS, type ContactTopic } from "@/lib/contact/topics";

interface Props {
  /** Initial topic, e.g. when arriving from "Contact sales" on /pricing. */
  initialTopic?: ContactTopic;
}

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; delivered: boolean; message?: string }
  | { kind: "error"; message: string };

const MAX_MESSAGE = 5000;

export function ContactForm({ initialTopic = "general" }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<ContactTopic>(initialTopic);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [referrer, setReferrer] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });

  // Capture the document referrer once at mount so operators can see where
  // the submission originated. Falls back to current pathname for direct loads.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setReferrer(document.referrer || window.location.pathname);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "sending") return;
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          topic,
          message: message.trim(),
          referrer,
          website,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        delivered?: boolean;
        message?: string;
      };
      if (!res.ok) {
        setState({
          kind: "error",
          message: data.message ?? `Request failed (HTTP ${res.status}).`,
        });
        return;
      }
      setState({
        kind: "sent",
        delivered: data.delivered !== false,
        message: data.message,
      });
    } catch (err) {
      setState({
        kind: "error",
        message: (err as Error).message ?? "Network error.",
      });
    }
  }

  if (state.kind === "sent") {
    return (
      <div
        className="rounded-md border border-accent/40 bg-accent/10 p-5 text-sm"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
          <div className="space-y-2">
            <p className="font-medium text-fg">
              {state.delivered ? "Message sent." : "We couldn't deliver right now."}
            </p>
            <p className="text-xs text-fg-muted">
              {state.delivered ? (
                <>
                  Thanks &mdash; we&rsquo;ll reply to{" "}
                  <span className="font-mono text-fg">{email}</span> within one
                  business day. For security reports, please also encrypt
                  sensitive details with our PGP key on{" "}
                  <a href="/security.txt" className="text-accent hover:underline">
                    /security.txt
                  </a>
                  .
                </>
              ) : (
                state.message ??
                "Email delivery isn't configured on this deployment yet. Try again later."
              )}
            </p>
            <button
              type="button"
              onClick={() => {
                setName("");
                setEmail("");
                setMessage("");
                setState({ kind: "idle" });
              }}
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
            >
              Send another message
              <ArrowRight className="h-3 w-3" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const sending = state.kind === "sending";

  return (
    <form onSubmit={submit} className="space-y-5" noValidate aria-busy={sending}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="contact-name">Name</Label>
          <Input
            id="contact-name"
            name="name"
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={sending}
            placeholder="Ada Lovelace"
            maxLength={120}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact-email">Email</Label>
          <Input
            id="contact-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={sending}
            placeholder="you@company.com"
            maxLength={254}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="contact-topic">Topic</Label>
        <select
          id="contact-topic"
          name="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value as ContactTopic)}
          disabled={sending}
          className="flex h-10 w-full rounded border hairline bg-bg-sunken px-3 py-2 font-mono text-sm text-fg focus:border-line-strong focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {CONTACT_TOPICS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="contact-message">Message</Label>
          <span
            className="text-[11px] text-fg-faint tabular-nums"
            aria-live="polite"
          >
            {message.length}/{MAX_MESSAGE}
          </span>
        </div>
        <Textarea
          id="contact-message"
          name="message"
          required
          rows={7}
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
          disabled={sending}
          placeholder="Tell us what you're working on, the question you have, or the issue you've run into. The more specific, the faster we can help."
          minLength={10}
          maxLength={MAX_MESSAGE}
        />
      </div>

      {/* Honeypot — visually hidden, off-screen, and aria-hidden so screen
          readers skip it. Bots that fill every input get caught server-side. */}
      <div className="absolute left-[-9999px] top-[-9999px]" aria-hidden>
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {state.kind === "error" && (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {state.message}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button type="submit" disabled={sending} aria-busy={sending}>
          {sending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Sending…
            </>
          ) : (
            <>
              <Mail className="h-4 w-4" aria-hidden />
              Send message
            </>
          )}
        </Button>
        <p className="text-[11px] text-fg-faint">
          We reply within one business day. No marketing, no auto-responders.
        </p>
      </div>
    </form>
  );
}
