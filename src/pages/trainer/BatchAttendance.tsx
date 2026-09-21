import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";
import { useBranch } from "@/context/BranchContext";
import { useAllMembers, useAllBatches, useAttendanceMapForDate, useAttendanceRecordForDate } from "@/hooks/useTrainerData";
import { supabase } from "@/lib/supabaseClient";
import { SearchBar } from "@/components/ui/SearchBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StatCard } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { todayISO, daysAgoISO, formatDate } from "@/lib/utils";

const EDIT_WINDOW_DAYS = 6; // plus today = 7 days total, matching the trainer RLS window

interface DemoVisitorDraft {
  name: string;
  phone: string;
}

async function ensureRecordId(batchId: string, trainerId: string, date: string): Promise<string> {
  const { data: existing } = await supabase
    .from("attendance_records")
    .select("id")
    .eq("batch_id", batchId)
    .eq("trainer_id", trainerId)
    .eq("session_date", date)
    .limit(1);
  if (existing && existing.length > 0) return existing[0].id;

  const { data: created, error } = await supabase
    .from("attendance_records")
    .insert({ batch_id: batchId, trainer_id: trainerId, session_date: date })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

export function BatchAttendance() {
  const { batchId } = useParams<{ batchId: string }>();
  const { profile } = useAuth();
  const { selectedBranchId } = useBranch();
  const queryClient = useQueryClient();

  // Every member in this branch is eligible for every one of this branch's
  // batch sessions — attendance is recorded against whichever batch the
  // trainer is actually running, not the member's own assigned batch.
  const { data: members, isLoading } = useAllMembers(selectedBranchId ?? undefined);
  const { data: batches } = useAllBatches(selectedBranchId ?? undefined);
  const minEditableDate = daysAgoISO(EDIT_WINDOW_DAYS);
  const [date, setDate] = useState(todayISO());
  const isToday = date === todayISO();
  const { data: existingRecord, isLoading: recordLoading } = useAttendanceRecordForDate(batchId, profile?.id, date);
  const { data: presenceMap = new Map(), isLoading: presenceLoading } = useAttendanceMapForDate(profile?.id, date);

  const currentBatch = batches?.find((b) => b.id === batchId);
  const batchNameById = new Map((batches ?? []).map((b) => [b.id, b.name]));
  const batchCategoryById = new Map((batches ?? []).map((b) => [b.id, b.category]));
  const isKidsBatch = currentBatch?.category === "kids";

  const [search, setSearch] = useState("");
  const [rosterFilter, setRosterFilter] = useState<"all" | "this_batch">("this_batch");
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  const [entryIdByMember, setEntryIdByMember] = useState<Map<string, string>>(new Map());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [markingAll, setMarkingAll] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [showDemoForm, setShowDemoForm] = useState(false);
  const [demoDraft, setDemoDraft] = useState<DemoVisitorDraft>({ name: "", phone: "" });
  const [addingDemo, setAddingDemo] = useState(false);
  const recordIdRef = useRef<string | null>(null);

  // Keep local present/entry state in sync with the server's copy of today's record.
  useEffect(() => {
    recordIdRef.current = existingRecord?.id ?? null;
    const present = new Set<string>();
    const entryMap = new Map<string, string>();
    for (const e of existingRecord?.entries ?? []) {
      if (e.present) {
        present.add(e.member_id);
        entryMap.set(e.member_id, e.id);
      }
    }
    setPresentIds(present);
    setEntryIdByMember(entryMap);
  }, [existingRecord]);

  // Kids batches only ever show members whose own assigned batch is also a
  // kids batch, and kids are hidden from every non-kids batch.
  const kidsFilteredMembers = (members ?? []).filter((m) => {
    const memberIsKid = !!m.batchId && batchCategoryById.get(m.batchId) === "kids";
    return isKidsBatch ? memberIsKid : !memberIsKid;
  });

  // A member already marked present in a different batch's session today
  // can't be marked here too — they only belong to one session per day.
  const presentElsewhereIds = new Set(
    kidsFilteredMembers
      .filter((m) => {
        const presence = presenceMap.get(m.id);
        return presence && presence.batchId !== batchId;
      })
      .map((m) => m.id)
  );
  const actionableMembers = kidsFilteredMembers.filter((m) => !presentElsewhereIds.has(m.id));

  const rosterMembers =
    rosterFilter === "this_batch" ? actionableMembers.filter((m) => m.batchId === batchId) : actionableMembers;
  const unmarkedInRosterCount = rosterMembers.filter((m) => !presentIds.has(m.id)).length;

  // In "All Members" mode, also surface who's already accounted for
  // elsewhere today — visible for reference, but not actionable from here.
  const presentElsewhereMembers =
    rosterFilter === "all" ? kidsFilteredMembers.filter((m) => presentElsewhereIds.has(m.id)) : [];
  const displayMembers = [...rosterMembers, ...presentElsewhereMembers];

  // Present anywhere in the branch today (any batch), for the "All Members" scorecard.
  const presentAnywhereCount = kidsFilteredMembers.filter((m) => presenceMap.has(m.id)).length;
  const scorecardTotal = rosterFilter === "all" ? kidsFilteredMembers.length : rosterMembers.length;
  const scorecardPresent =
    rosterFilter === "all" ? presentAnywhereCount : rosterMembers.filter((m) => presentIds.has(m.id)).length;

  const q = search.toLowerCase().trim();
  const filteredMembers = q
    ? displayMembers.filter((m) => m.name.toLowerCase().includes(q) || m.phone.toLowerCase().includes(q))
    : displayMembers;

  const { page, pageSize, pageCount, total, pageItems, setPage, changePageSize } = usePagination(filteredMembers);

  async function invalidateAll() {
    if (!profile) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["attendance-record", batchId, profile.id] }),
      queryClient.invalidateQueries({ queryKey: ["attendance-map", profile.id] }),
      queryClient.invalidateQueries({ queryKey: ["all-members-attendance-today", profile.id] }),
    ]);
  }

  async function toggleMember(memberId: string) {
    if (!batchId || !profile || savingIds.has(memberId)) return;
    setPageError(null);
    const wasPresent = presentIds.has(memberId);

    setSavingIds((prev) => new Set(prev).add(memberId));
    setPresentIds((prev) => {
      const next = new Set(prev);
      if (wasPresent) next.delete(memberId);
      else next.add(memberId);
      return next;
    });

    try {
      if (wasPresent) {
        const entryId = entryIdByMember.get(memberId);
        if (entryId) {
          const { error } = await supabase.from("attendance_entries").delete().eq("id", entryId);
          if (error) throw error;
          setEntryIdByMember((prev) => {
            const next = new Map(prev);
            next.delete(memberId);
            return next;
          });
        }
      } else {
        if (!recordIdRef.current) {
          recordIdRef.current = await ensureRecordId(batchId, profile.id, date);
        }
        const { data, error } = await supabase
          .from("attendance_entries")
          .insert({ attendance_record_id: recordIdRef.current, member_id: memberId, present: true })
          .select("id")
          .single();
        if (error) throw error;
        setEntryIdByMember((prev) => new Map(prev).set(memberId, data.id));
      }
      await invalidateAll();
    } catch (e: any) {
      // Roll back the optimistic toggle.
      setPresentIds((prev) => {
        const next = new Set(prev);
        if (wasPresent) next.add(memberId);
        else next.delete(memberId);
        return next;
      });
      setPageError(e.message ?? "Failed to update attendance.");
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(memberId);
        return next;
      });
    }
  }

  async function markAllPresent() {
    if (!batchId || !profile) return;
    const toMark = rosterMembers.filter((m) => !presentIds.has(m.id));
    if (toMark.length === 0) return;
    const confirmed = window.confirm(
      `Mark all ${toMark.length} member${toMark.length === 1 ? "" : "s"} as present?`
    );
    if (!confirmed) return;

    setMarkingAll(true);
    setPageError(null);
    try {
      if (!recordIdRef.current) {
        recordIdRef.current = await ensureRecordId(batchId, profile.id, date);
      }
      const { data, error } = await supabase
        .from("attendance_entries")
        .insert(toMark.map((m) => ({ attendance_record_id: recordIdRef.current, member_id: m.id, present: true })))
        .select("id, member_id");
      if (error) throw error;

      setPresentIds((prev) => {
        const next = new Set(prev);
        toMark.forEach((m) => next.add(m.id));
        return next;
      });
      setEntryIdByMember((prev) => {
        const next = new Map(prev);
        (data ?? []).forEach((row: any) => next.set(row.member_id, row.id));
        return next;
      });
      await invalidateAll();
    } catch (e: any) {
      setPageError(e.message ?? "Failed to mark everyone present.");
    } finally {
      setMarkingAll(false);
    }
  }

  async function addDemoVisitor() {
    if (!demoDraft.name.trim() || !demoDraft.phone.trim() || !batchId || !profile) return;
    setAddingDemo(true);
    setPageError(null);
    try {
      if (!recordIdRef.current) {
        recordIdRef.current = await ensureRecordId(batchId, profile.id, date);
      }
      const { error } = await supabase.from("demo_visitors").insert({
        attendance_record_id: recordIdRef.current,
        name: demoDraft.name,
        phone: demoDraft.phone,
        visit_date: date,
      });
      if (error) throw error;
      setDemoDraft({ name: "", phone: "" });
      setShowDemoForm(false);
      await invalidateAll();
    } catch (e: any) {
      setPageError(e.message ?? "Failed to add demo visitor.");
    } finally {
      setAddingDemo(false);
    }
  }

  function MemberRow({ member }: { member: (typeof kidsFilteredMembers)[number] }) {
    const presence = presenceMap.get(member.id);
    const presentElsewhere = !!presence && presence.batchId !== batchId;
    const checked = presentElsewhere ? true : presentIds.has(member.id);
    const saving = savingIds.has(member.id);
    const expired = member.status === "expired";

    return (
      <div
        className={clsx(
          "flex items-center gap-4 px-4 py-3.5 transition-colors",
          !presentElsewhere && "cursor-pointer",
          checked && "bg-accent-green/5",
          expired && !checked && "bg-status-expired/10",
          saving && "opacity-60",
          presentElsewhere && "opacity-60"
        )}
      >
        <label className="flex flex-1 items-center gap-4 min-w-0">
          <input
            type="checkbox"
            checked={checked}
            disabled={saving || presentElsewhere}
            onChange={() => toggleMember(member.id)}
            className="h-6 w-6 shrink-0 rounded border-2 border-base-500 accent-accent-green"
          />
          <div className="min-w-0 flex-1">
            <div className={clsx("truncate font-semibold", expired && !checked && "text-status-expired")}>
              {expired && !checked && "⚠️ "}
              {member.name}
            </div>
            <div className="text-xs text-white/40">
              {member.phone}
              {saving && <span className="ml-2 text-white/30">Saving…</span>}
            </div>
            {presentElsewhere && (
              <div className="text-xs text-accent-green">✓ Present in {presence!.batchName}</div>
            )}
            {!presentElsewhere && member.batchId && member.batchId !== batchId && (
              <div className="text-xs text-white/30">
                Usually in {batchNameById.get(member.batchId) ?? "another batch"}
              </div>
            )}
            {!presentElsewhere && !member.batchId && (
              <div className="text-xs text-yellow-500/60">No batch assigned</div>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <StatusBadge status={member.status} />
            {member.status === "expired" && (
              <span className="text-[10px] text-status-expired/70">Exp {formatDate(member.expiry_date)}</span>
            )}
          </div>
        </label>
        {presentElsewhere && (
          <Link
            to={`/trainer/batch/${presence!.batchId}`}
            className="btn-ghost shrink-0 !px-3 !py-1.5 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            Go →
          </Link>
        )}
      </div>
    );
  }

  const demoVisitors = existingRecord?.demo_visitors ?? [];

  if (isLoading || recordLoading || presenceLoading) {
    return <p className="text-white/50">Loading roster…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <Link to="/trainer" className="text-xs text-white/40 hover:text-white/70">
            ← Back to today
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{currentBatch ? currentBatch.name : "Mark Attendance"}</h1>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="date"
              className="input !w-auto !py-1.5 text-sm"
              value={date}
              min={minEditableDate}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
            />
            {!isToday && (
              <button className="btn-ghost !py-1.5 text-xs" onClick={() => setDate(todayISO())}>
                Jump to today
              </button>
            )}
          </div>
        </div>
        <span className="rounded-full border border-accent-green/40 bg-accent-green/10 px-3 py-1.5 text-xs font-semibold text-accent-green">
          {presentIds.size} present in current batch
        </span>
      </div>

      <p className="text-xs text-white/30">
        {isToday
          ? "Tap a member to mark them present or absent — it saves instantly, no submit step needed."
          : `Editing ${formatDate(date, "EEEE, dd MMM yyyy")} — corrections are allowed up to 7 days back.`}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label={rosterFilter === "all" ? (isToday ? "Present Today (All Batches)" : "Present That Day (All Batches)") : "Present"}
          value={scorecardPresent}
          accent="green"
        />
        <StatCard label="Absent" value={scorecardTotal - scorecardPresent} accent="red" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={clsx(
            "rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors",
            rosterFilter === "all"
              ? "border-accent-green bg-accent-green/10 text-accent-green"
              : "border-base-600 text-white/50 hover:text-white"
          )}
          onClick={() => setRosterFilter("all")}
        >
          All Members
        </button>
        <button
          type="button"
          className={clsx(
            "rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors",
            rosterFilter === "this_batch"
              ? "border-accent-green bg-accent-green/10 text-accent-green"
              : "border-base-600 text-white/50 hover:text-white"
          )}
          onClick={() => setRosterFilter("this_batch")}
        >
          Only This Batch
        </button>
      </div>

      {rosterFilter === "this_batch" && unmarkedInRosterCount > 0 && (
        <button
          className="btn w-full border border-accent-green/40 bg-accent-green/10 text-white/80 hover:bg-accent-green/20"
          onClick={markAllPresent}
          disabled={markingAll}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-green text-xs font-bold text-base-900">
            ✓
          </span>
          {markingAll ? "Marking…" : `Mark All Present (${unmarkedInRosterCount})`}
        </button>
      )}

      <SearchBar value={search} onChange={setSearch} placeholder="Search any member by name or phone…" />

      <div className="card divide-y divide-base-700">
        {filteredMembers.length === 0 && (
          <div className="px-4 py-8 text-center text-white/40">
            {search
              ? `No members match "${search}"`
              : rosterFilter === "this_batch"
              ? "No members are assigned to this batch. Switch to \"All Members\" to mark someone from another batch."
              : isKidsBatch
              ? "No members assigned to a kids batch yet."
              : "No members to show."}
          </div>
        )}
        {pageItems.map((member) => (
          <MemberRow key={member.id} member={member} />
        ))}
      </div>

      <Pagination page={page} pageCount={pageCount} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={changePageSize} />

      {demoVisitors.length > 0 && (
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold text-white/60">Demo Visitors ({demoVisitors.length})</h3>
          <ul className="space-y-1 text-sm">
            {demoVisitors.map((v: any) => (
              <li key={v.id} className="flex justify-between text-white/80">
                <span>{v.name}</span>
                <span className="text-white/40">{v.phone}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showDemoForm ? (
        <div className="card space-y-3 p-4">
          <h3 className="font-semibold">Add Demo Visitor</h3>
          <input
            className="input"
            placeholder="Full name"
            value={demoDraft.name}
            onChange={(e) => setDemoDraft((d) => ({ ...d, name: e.target.value }))}
          />
          <input
            className="input"
            placeholder="Phone number"
            value={demoDraft.phone}
            onChange={(e) => setDemoDraft((d) => ({ ...d, phone: e.target.value }))}
          />
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={addDemoVisitor} disabled={addingDemo}>
              {addingDemo ? "Adding…" : "Add"}
            </button>
            <button className="btn-ghost" onClick={() => setShowDemoForm(false)} disabled={addingDemo}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="btn-secondary w-full" onClick={() => setShowDemoForm(true)}>
          + Add Demo Visitor
        </button>
      )}

      {pageError && (
        <div className="rounded-lg border border-status-expired/40 bg-status-expired/10 px-3 py-2 text-sm text-status-expired">
          {pageError}
        </div>
      )}
    </div>
  );
}
