/**
 * Shared contact-form topic taxonomy. Imported by the form component
 * (client), the API route (server), and the email template (server),
 * so the values can't drift across layers.
 */

export type ContactTopic =
  | "general"
  | "sales"
  | "support"
  | "security"
  | "press";

export const CONTACT_TOPICS: Array<{ value: ContactTopic; label: string }> = [
  { value: "general", label: "General question" },
  { value: "sales", label: "Sales / Team plan" },
  { value: "support", label: "Support" },
  { value: "security", label: "Security report" },
  { value: "press", label: "Press / Media" },
];

export const CONTACT_TOPIC_VALUES: ReadonlyArray<ContactTopic> = [
  "general",
  "sales",
  "support",
  "security",
  "press",
];

export const CONTACT_TOPIC_LABEL: Record<ContactTopic, string> =
  Object.fromEntries(CONTACT_TOPICS.map((t) => [t.value, t.label])) as Record<
    ContactTopic,
    string
  >;
