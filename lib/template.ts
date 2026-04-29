/**
 * Token replacement for messages: {first_name}, {username}, {full_name}, {phone}, {source}.
 * Tokens with no value fall back to a neutral string ("amigo" for first_name, "" otherwise).
 */
import type { Lead } from "@prisma/client";

export function renderTemplate(template: string | null | undefined, lead: Pick<Lead, "firstName" | "lastName" | "username" | "phone" | "source">): string | undefined {
  if (template == null) return undefined;
  if (template.indexOf("{") === -1) return template;

  const firstName = lead.firstName?.trim() || "amigo";
  const lastName = lead.lastName?.trim() || "";
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim() || firstName;
  const username = lead.username ? `@${lead.username}` : "";
  const phone = lead.phone || "";
  const source = lead.source || "";

  const map: Record<string, string> = {
    "{first_name}": firstName,
    "{last_name}": lastName,
    "{full_name}": fullName,
    "{name}": firstName,
    "{username}": username,
    "{phone}": phone,
    "{source}": source,
  };

  return template.replace(/\{(first_name|last_name|full_name|name|username|phone|source)\}/g, (m) => map[m] ?? m);
}
