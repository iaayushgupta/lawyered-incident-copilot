import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ConfidenceBucket, Urgency } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Deterministic hashing (FNV-1a) — used for file hashes + audit chaining ──
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // to unsigned hex
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function shortHash(input: string, len = 12): string {
  return (fnv1a(input) + fnv1a("salt:" + input)).slice(0, len);
}

// ── Deterministic RNG (mulberry32) seeded from a string ──
export function seedFrom(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFromString(str: string) {
  return mulberry32(seedFrom(str));
}

export function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ── Confidence helpers ──
export function bucketFor(score: number): ConfidenceBucket {
  if (score < 0.35) return "very_low";
  if (score < 0.55) return "low";
  if (score < 0.72) return "medium";
  if (score < 0.88) return "high";
  return "very_high";
}

export const CONFIDENCE_BUCKET_LABEL: Record<ConfidenceBucket, string> = {
  very_low: "Very low",
  low: "Low",
  medium: "Medium",
  high: "High",
  very_high: "Very high",
};

// ── Formatting ──
export function inr(amount: number): string {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}k`;
  return `₹${amount}`;
}

export function inrFull(amount: number): string {
  return "₹" + amount.toLocaleString("en-IN");
}

export function pct(score: number): string {
  return `${Math.round(score * 100)}%`;
}

export function minutesToHuman(min: number): string {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Fixed reference "now" for deterministic SLA maths across the prototype.
// (Matches the dataset creation window; real deployments use the wall clock.)
export const NOW = new Date("2026-07-15T12:30:00+05:30");

export function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMin = Math.round((NOW.getTime() - then) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export const URGENCY_ORDER: Record<Urgency, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};
