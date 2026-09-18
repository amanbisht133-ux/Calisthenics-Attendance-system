import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { extractFunctionErrorMessage } from "@/lib/edgeFunctions";
import { formatDate } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";
import { Pagination } from "@/components/ui/Pagination";

interface ReminderMember {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  expiry_date: string;
  status: "expired" | "expiring_soon";
}

interface SendResult {
  sent: number;
  skipped: number;
  failed: { id: string; name: string; error: string }[];
}

export function Reminders() {
  const { data: members, isLoading } = useQuery({
    queryKey: ["reminder-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_member_status")
        .select("id, name, phone, email, expiry_date, status")
        .in("status", ["expired", "expiring_soon"])
        .order("expiry_date");
      if (error) throw error;
      return (data ?? []) as ReminderMember[];
    },
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Default-select everyone who has an email, whenever the list (re)loads.
  useEffect(() => {
    if (members) {
      setSelected(new Set(members.filter((m) => m.email).map((m) => m.id)));
    }
  }, [members]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedMembers = (members ?? []).filter((m) => selected.has(m.id) && m.email);

  async function handleSend() {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("send-membership-reminders", {
        body: {
          members: selectedMembers.map((m) => ({
            id: m.id,
            name: m.name,
            email: m.email,
            expiry_date: m.expiry_date,
            status: m.status,
          })),
        },
      });
      if (fnError) throw new Error(await extractFunctionErrorMessage(fnError, "Failed to send reminders."));
      if (data?.error) throw new Error(data.error);
      setResult(data);
      setShowConfirm(false);
    } catch (e: any) {
      setError(e.message ?? "Failed to send reminders.");
    } finally {
      setSending(false);
    }
  }

  const withEmail = (members ?? []).filter((m) => m.email).length;
  const withoutEmail = (members ?? []).length - withEmail;

  const { page, pageSize, pageCount, total, pageItems, setPage, changePageSize } = usePagination(members ?? []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Reminders</h1>
        <p className="text-sm text-white/50">
          {members?.length ?? 0} members expired or expiring soon — {withEmail} have an email on file, {withoutEmail}{" "}
          don't and will be skipped.
        </p>
      </div>

      {result && (
        <div className="rounded-lg border border-accent-green/40 bg-accent-green/10 px-4 py-3 text-sm">
          <p className="font-semibold text-accent-green">
            Sent {result.sent} email{result.sent === 1 ? "" : "s"}
            {result.skipped > 0 ? `, skipped ${result.skipped} without an email` : ""}
            {result.failed.length > 0 ? `, ${result.failed.length} failed` : ""}.
          </p>
          {result.failed.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-white/60">
              {result.failed.map((f) => (
                <li key={f.id}>
                  {f.name}: {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-status-expired/40 bg-status-expired/10 px-3 py-2 text-sm text-status-expired">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-2 text-xs">
          <button className="btn-ghost !py-1.5" onClick={() => setSelected(new Set((members ?? []).filter((m) => m.email).map((m) => m.id)))}>
            Select all with email
          </button>
          <button className="btn-ghost !py-1.5" onClick={() => setSelected(new Set())}>
            Select none
          </button>
        </div>
        <button className="btn-primary" onClick={() => setShowConfirm(true)} disabled={selectedMembers.length === 0}>
          ✉ Send Reminder Emails ({selectedMembers.length})
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-shell">
          <thead>
            <tr>
              <th></th>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Status</th>
              <th>Expiry</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((m) => (
              <tr key={m.id} className={clsx(!m.email && "opacity-50")}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(m.id)}
                    disabled={!m.email}
                    onChange={() => toggle(m.id)}
                    className="h-5 w-5 rounded border-2 border-base-500 accent-accent-green"
                  />
                </td>
                <td className="font-semibold">
                  <Link to={`/admin/members/${m.id}`} className="hover:underline">
                    {m.name}
                  </Link>
                </td>
                <td>{m.phone}</td>
                <td className="text-white/50">
                  {m.email ?? <span className="text-yellow-500/70">No email on file</span>}
                </td>
                <td>
                  <StatusBadge status={m.status} />
                </td>
                <td>{formatDate(m.expiry_date)}</td>
              </tr>
            ))}
            {!isLoading && (members ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-white/40">
                  No expired or expiring-soon members right now. 🎉
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageCount={pageCount} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={changePageSize} />

      {showConfirm && (
        <Modal title="Send Reminder Emails" onClose={() => setShowConfirm(false)}>
          <div className="space-y-4">
            <p className="text-sm text-white/70">
              This will send a renewal reminder email to <strong>{selectedMembers.length}</strong> member
              {selectedMembers.length === 1 ? "" : "s"} right now. This can't be undone.
            </p>
            <button className="btn-primary w-full" onClick={handleSend} disabled={sending}>
              {sending ? "Sending…" : `Send to ${selectedMembers.length} Member${selectedMembers.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
