import { addMonths, format, formatISO, parseISO } from "date-fns";
import type { Batch, MembershipPlan, MemberStatus, PaymentStatus } from "./database.types";

export function planToMonths(plan: MembershipPlan): number {
  switch (plan) {
    case "monthly":
      return 1;
    case "quarterly":
      return 3;
    case "half_yearly":
      return 6;
  }
}

export function calcExpiry(startDate: string, plan: MembershipPlan): string {
  const start = parseISO(startDate);
  const expiry = addMonths(start, planToMonths(plan));
  return formatISO(expiry, { representation: "date" });
}

export function memberStatus(expiryDateISO: string, asOf: Date = new Date()): MemberStatus {
  const expiry = parseISO(expiryDateISO);
  const today = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  const expiryDay = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
  const diffDays = Math.round((expiryDay.getTime() - today.getTime()) / 86_400_000);

  if (diffDays < 0) return "expired";
  if (diffDays <= 7) return "expiring_soon";
  return "active";
}

export function statusLabel(status: MemberStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "expiring_soon":
      return "Expiring Soon";
    case "expired":
      return "Expired";
  }
}

export function formatDate(iso: string, pattern = "dd MMM yyyy"): string {
  return format(parseISO(iso), pattern);
}

export function todayISO(): string {
  return formatISO(new Date(), { representation: "date" });
}

export function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatISO(d, { representation: "date" });
}

export function monthStartISO(asOf: Date = new Date()): string {
  return formatISO(new Date(asOf.getFullYear(), asOf.getMonth(), 1), { representation: "date" });
}

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Supports "Mon-Fri" / "Sat-Sun" style ranges (wrapping across the week if needed). */
export function batchRunsToday(days: string, asOf: Date = new Date()): boolean {
  const todayIdx = asOf.getDay();
  const parts = days.split("-").map((d) => d.trim());
  if (parts.length !== 2) return days.toLowerCase().includes(DAY_ABBR[todayIdx].toLowerCase());

  const startIdx = DAY_ABBR.findIndex((d) => d.toLowerCase() === parts[0].toLowerCase());
  const endIdx = DAY_ABBR.findIndex((d) => d.toLowerCase() === parts[1].toLowerCase());
  if (startIdx === -1 || endIdx === -1) return true;

  if (startIdx <= endIdx) {
    return todayIdx >= startIdx && todayIdx <= endIdx;
  }
  return todayIdx >= startIdx || todayIdx <= endIdx;
}

export type BatchTimeBucket = "morning" | "afternoon" | "evening" | "kids" | "other";

export const BATCH_TIME_BUCKETS: { key: BatchTimeBucket; label: string; icon: string }[] = [
  { key: "morning", label: "Morning", icon: "🌅" },
  { key: "afternoon", label: "Afternoon", icon: "☀️" },
  { key: "evening", label: "Evening", icon: "🌙" },
  { key: "kids", label: "Kids", icon: "🧒" },
  { key: "other", label: "Other", icon: "📋" },
];

/** Parses a free-form time_slot string (e.g. "7:00 - 8:00 PM") into which part of the day it starts in. */
export function timeSlotPeriod(timeSlot: string): "morning" | "afternoon" | "evening" | "other" {
  const match = timeSlot.match(/(\d{1,2})(?::\d{2})?\s*(am|pm)?/i);
  if (!match) return "other";

  let hour = parseInt(match[1], 10);
  let meridiem: string | undefined = match[2]?.toLowerCase();

  // Ranges like "7:00 - 8:00 PM" only carry AM/PM on the end time, not
  // right after the start hour where the regex above looks — fall back to
  // scanning the whole string, since a slot almost always shares one period.
  if (!meridiem) {
    meridiem = timeSlot.match(/\b(am|pm)\b/i)?.[1]?.toLowerCase();
  }

  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (!meridiem && hour >= 1 && hour <= 6) hour += 12; // e.g. "5:30-6:30" with no am/pm -> assume evening

  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/** Kids batches bucket by category regardless of time; everything else buckets by its time_slot's start hour. */
export function batchTimeBucket(batch: Pick<Batch, "category" | "time_slot">): BatchTimeBucket {
  if (batch.category === "kids") return "kids";
  return timeSlotPeriod(batch.time_slot);
}

/** Current time-of-day bucket, used to auto-expand the relevant accordion section. */
export function currentTimeBucket(asOf: Date = new Date()): BatchTimeBucket {
  const hour = asOf.getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function paymentStatus(totalFee: number | null, totalPaid: number): PaymentStatus {
  if (!totalFee || totalPaid >= totalFee) return "paid";
  if (totalPaid > 0) return "partial";
  return "unpaid";
}

export function paymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case "paid":
      return "Paid";
    case "partial":
      return "Partially Paid";
    case "unpaid":
      return "Not Paid";
  }
}

export function planLabel(plan: MembershipPlan): string {
  switch (plan) {
    case "monthly":
      return "Monthly";
    case "quarterly":
      return "Quarterly";
    case "half_yearly":
      return "Half-Yearly";
  }
}
