import type { Role } from "./types";

// ── PII masking helpers ──
// The dataset stores already-masked phone/licence values, but free text (raw
// inputs, transcripts) can contain PII. maskText redacts obvious patterns for
// roles that are not permitted to see raw PII.

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "•••••";
  return `${digits.slice(0, 2)}••••${digits.slice(-2)}`;
}

export function maskLicence(licence: string): string {
  if (licence.length < 4) return "••••";
  return `${licence.slice(0, 2)}••••••${licence.slice(-2)}`;
}

const PHONE_RE = /(\+?\d[\d\s-]{8,}\d)/g;
const LICENCE_RE = /\b([A-Z]{2}\d{2}\s?\d{4}\d{6,7})\b/g;
const AADHAAR_RE = /\b(\d{4}\s?\d{4}\s?\d{4})\b/g;

export function redactText(text: string): string {
  return text
    .replace(PHONE_RE, (m) => maskPhone(m))
    .replace(LICENCE_RE, "••-licence-••")
    .replace(AADHAAR_RE, "••••-redacted-••••");
}

// Roles permitted to view unmasked PII in free text.
const PII_ALLOWED: Role[] = ["legal_ops", "lawyer", "admin", "auditor"];

export function applyPii(text: string, role: Role): string {
  return PII_ALLOWED.includes(role) ? text : redactText(text);
}
