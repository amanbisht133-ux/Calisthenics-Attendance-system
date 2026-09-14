import clsx from "clsx";
import type { MemberStatus } from "@/lib/database.types";
import { statusLabel } from "@/lib/utils";

const styles: Record<MemberStatus, string> = {
  active: "bg-status-active/15 text-status-active border-status-active/30",
  expiring_soon: "bg-status-expiring/15 text-status-expiring border-status-expiring/30",
  expired: "bg-status-expired/15 text-status-expired border-status-expired/30",
};

const dots: Record<MemberStatus, string> = {
  active: "bg-status-active",
  expiring_soon: "bg-status-expiring",
  expired: "bg-status-expired",
};

export function StatusBadge({ status }: { status: MemberStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
        styles[status]
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", dots[status])} />
      {statusLabel(status)}
    </span>
  );
}
