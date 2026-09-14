import { addMonths, format, formatISO, parseISO } from "date-fns";
import type { MembershipPlan, MemberStatus } from "./database.types";

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
