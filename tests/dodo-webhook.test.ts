import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DodoError, verifyWebhookSignature } from "@/server/billing/dodo";

/**
 * Webhook signature verification for Dodo Payments. We implement
 * Standard Webhooks ourselves rather than pulling in `standardwebhooks`
 * (tiny algorithm, one dep to skip), so these tests pin the spec.
 *
 * Signed payload: `${webhook-id}.${webhook-timestamp}.${raw_body}`,
 * HMAC-SHA256 with the (base64-decoded if possible) secret, then
 * base64-encoded. The header carries `v1,<sig>` entries.
 */

const SECRET = "whsec_dGVzdC1zZWNyZXQtdGVzdC1zZWNyZXQ="; // base64 of "test-secret-test-secret"
const RAW_SECRET_BYTES = Buffer.from("test-secret-test-secret", "utf8");

function sign(id: string, ts: string, body: string, secretBytes = RAW_SECRET_BYTES): string {
  const content = `${id}.${ts}.${body}`;
  const sig = createHmac("sha256", secretBytes).update(content).digest("base64");
  return `v1,${sig}`;
}

function now(): string {
  return String(Math.floor(Date.now() / 1000));
}

describe("verifyWebhookSignature", () => {
  it("accepts a valid signature", () => {
    const body = JSON.stringify({ type: "subscription.active", data: { subscription_id: "sub_1" } });
    const id = "msg_abc";
    const ts = now();
    const sig = sign(id, ts, body);
    expect(() =>
      verifyWebhookSignature({
        secret: SECRET,
        rawBody: body,
        webhookId: id,
        webhookTimestamp: ts,
        webhookSignature: sig,
      }),
    ).not.toThrow();
  });

  it("rejects a tampered body", () => {
    const id = "msg_abc";
    const ts = now();
    const sig = sign(id, ts, '{"type":"subscription.active"}');
    expect(() =>
      verifyWebhookSignature({
        secret: SECRET,
        rawBody: '{"type":"subscription.cancelled"}',
        webhookId: id,
        webhookTimestamp: ts,
        webhookSignature: sig,
      }),
    ).toThrow(DodoError);
  });

  it("rejects when the secret is wrong", () => {
    const body = "{}";
    const id = "msg_1";
    const ts = now();
    const sig = sign(id, ts, body, Buffer.from("different-secret"));
    expect(() =>
      verifyWebhookSignature({
        secret: SECRET,
        rawBody: body,
        webhookId: id,
        webhookTimestamp: ts,
        webhookSignature: sig,
      }),
    ).toThrow(DodoError);
  });

  it("rejects a stale timestamp (replay)", () => {
    const body = "{}";
    const id = "msg_1";
    const ts = String(Math.floor(Date.now() / 1000) - 10 * 60); // 10 min old
    const sig = sign(id, ts, body);
    expect(() =>
      verifyWebhookSignature({
        secret: SECRET,
        rawBody: body,
        webhookId: id,
        webhookTimestamp: ts,
        webhookSignature: sig,
      }),
    ).toThrow(/out of tolerance/);
  });

  it("rejects when any header is missing", () => {
    expect(() =>
      verifyWebhookSignature({
        secret: SECRET,
        rawBody: "{}",
        webhookId: "",
        webhookTimestamp: now(),
        webhookSignature: "v1,sig",
      }),
    ).toThrow(/Missing webhook signature headers/);
  });

  it("rejects when the secret is empty (config error)", () => {
    expect(() =>
      verifyWebhookSignature({
        secret: "",
        rawBody: "{}",
        webhookId: "msg_1",
        webhookTimestamp: now(),
        webhookSignature: "v1,sig",
      }),
    ).toThrow(/Webhook secret is not configured/);
  });

  it("rejects a non-numeric timestamp", () => {
    expect(() =>
      verifyWebhookSignature({
        secret: SECRET,
        rawBody: "{}",
        webhookId: "msg_1",
        webhookTimestamp: "tomorrow",
        webhookSignature: "v1,sig",
      }),
    ).toThrow(/Invalid webhook-timestamp/);
  });

  it("ignores non-v1 entries and accepts the v1 match", () => {
    const body = "{}";
    const id = "msg_1";
    const ts = now();
    const v1 = sign(id, ts, body).split(",")[1]!;
    const header = `v0,old-style v1,${v1}`;
    expect(() =>
      verifyWebhookSignature({
        secret: SECRET,
        rawBody: body,
        webhookId: id,
        webhookTimestamp: ts,
        webhookSignature: header,
      }),
    ).not.toThrow();
  });

  it("strips the whsec_ prefix from the secret", () => {
    // The raw key (after whsec_) is base64-decoded into bytes which
    // become the HMAC key. We confirm by computing the signature
    // with that decoded buffer directly.
    const body = "{}";
    const id = "msg_1";
    const ts = now();
    const sig = sign(id, ts, body, RAW_SECRET_BYTES);
    expect(() =>
      verifyWebhookSignature({
        secret: SECRET, // whsec_-prefixed
        rawBody: body,
        webhookId: id,
        webhookTimestamp: ts,
        webhookSignature: sig,
      }),
    ).not.toThrow();
  });
});
