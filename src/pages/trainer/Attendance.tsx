import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";
import { useBranch } from "@/context/BranchContext";
import {
  useAllBatches,
  useAllMembers,
  useAttendanceMapForDate,
  useAttendanceRecordForDate,
  useMemberDues,
} from "@/hooks/useTrainerData";
import { supabase } from "@/lib/supabaseClient";
import { MemberFlags, needsNudge } from "@/components/MemberFlags";
import { batchRunsToday, daysAgoISO, daysUntil, formatDate, slotStartLabel, slotStartMinutes, todayISO } from "@/lib/utils";
import type { Batch } from "@/lib/database.types";

const EDIT_WINDOW_DAYS = 6; // today + 6 days back, matching the trainer edit window in the database
const RECENTLY_EXPIRED_DAYS = 30; // expired longer ago than this drop off the class list (still findable by search)

type RosterMember = NonNullable<ReturnType<typeof useAllMembers>["data"]>[number];

async function ensureRecordId(batchId: string, trainerId: string, date: string): Promise<string> {
  const { data: existing } = await supabase
    .from("attendance_records")
    .select("id")
    .eq("batch_id", batchId)
    .eq("session_date", date)
    .order("submitted_at", { ascending: true })
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

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Short label for a class chip: "Kids", "Weekend", "Evening", "Morning". */
function classKind(batch: Batch): string {
  if (batch.category === "kids") return batch.days.toLowerCase().startsWith("sat") ? "Kids weekend" : "Kids";
  if (batch.days.toLowerCase().startsWith("sat")) return "Weekend";
  if (batch.category === "personal_training") return "PT";
  return slotStartMinutes(batch.time_slot) < 12 * 60 ? "Morning" : "Evening";
}

/** The class happening now, or the next one coming up, or the last one of the day. */
function pickCurrentBatch(batches: Batch[]): Batch | undefined {
  if (batches.length === 0) return undefined;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  // A class counts as "now" from 15 min before it starts until 60 min after.
  const running = batches.find((b) => {
    const start = slotStartMinutes(b.time_slot);
    return nowMins >= start - 15 && nowMins < start + 60;
  });
  if (running) return running;
  const next = batches.find((b) => slotStartMinutes(b.time_slot) > nowMins);
  return next ?? batches[batches.length - 1];
}

function initials(name: string): string {
  const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function Attendance() {
  const { batchId: batchIdFromPath } = useParams<{ batchId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuth();
  const { selectedBranchId } = useBranch();
  const branchId = selectedBranchId ?? undefined;
  const queryClient = useQueryClient();

  const [date, setDate] = useState(todayISO());
  const isToday = date === todayISO();
  const minDate = daysAgoISO(EDIT_WINDOW_DAYS);
  const dateObj = new Date(`${date}T00:00:00`);

  const { data: members, isLoading: membersLoading } = useAllMembers(branchId);
  const { data: batches, isLoading: batchesLoading } = useAllBatches(branchId);
  const { data: dues = new Map<string, number>() } = useMemberDues(branchId);

  // Classes that run on the chosen day, in time order.
  const dayBatches = useMemo(
    () =>
      (batches ?? [])
        .filter((b) => b.status === "active" && b.category !== "personal_training" && batchRunsToday(b.days, dateObj))
        .sort((a, b) => slotStartMinutes(a.time_slot) - slotStartMinutes(b.time_slot)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [batches, date]
  );

  const requestedBatch = searchParams.get("class") ?? batchIdFromPath ?? null;
  const [batchId, setBatchId] = useState<string | null>(requestedBatch);
  useEffect(() => {
    if (dayBatches.length === 0) return;
    if (!batchId || !dayBatches.some((b) => b.id === batchId)) {
      setBatchId((isToday ? pickCurrentBatch(dayBatches) : dayBatches[0])?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayBatches]);

  function chooseBatch(id: string) {
    setBatchId(id);
    setSearch("");
    setSearchParams({ class: id }, { replace: true });
  }

  const batch = dayBatches.find((b) => b.id === batchId);
  const { data: record, isLoading: recordLoading } = useAttendanceRecordForDate(batch?.id, profile?.id, date);
  const { data: presenceMap = new Map() } = useAttendanceMapForDate(profile?.id, date);

  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  const [entryIdByMember, setEntryIdByMember] = useState<Map<string, string>>(new Map());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [showUnassigned, setShowUnassigned] = useState(false);
  const recordIdRef = useRef<string | null>(null);

  useEffect(() => {
    recordIdRef.current = record?.id ?? null;
    const present = new Set<string>();
    const entries = new Map<string, string>();
    for (const e of (record as any)?.entries ?? []) {
      if (e.present) {
        present.add(e.member_id);
        entries.set(e.member_id, e.id);
      }
    }
    setPresentIds(present);
    setEntryIdByMember(entries);
  }, [record]);

  const allMembers: RosterMember[] = members ?? [];
  const isKidsClass = batch?.category === "kids";
  const kidBatchIds = new Set((batches ?? []).filter((b) => b.category === "kids").map((b) => b.id));

  // Who belongs on this class's list: members assigned to it whose package is
  // live or ended in the last month, plus anyone already marked here.
  const roster = allMembers
    .filter((m) => {
      if (!batch) return false;
      if (presentIds.has(m.id)) return true;
      if (!m.batchIds.includes(batch.id)) return false;
      return daysUntil(m.expiry_date) >= -RECENTLY_EXPIRED_DAYS;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const rosterIds = new Set(roster.map((m) => m.id));

  // Paying members who were never given a class time: show them so they never go unseen.
  const unassigned = allMembers
    .filter((m) => m.batchIds.length === 0 && daysUntil(m.expiry_date) >= 0 && !rosterIds.has(m.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const presentCount = roster.filter((m) => presentIds.has(m.id)).length;
  const nudgeCount = roster.filter((m) => needsNudge(m.expiry_date, dues.get(m.id))).length;
  const unmarked = roster.filter((m) => !presentIds.has(m.id) && !presentElsewhere(m.id));

  function presentElsewhere(memberId: string) {
    const p = presenceMap.get(memberId);
    return !!p && p.batchId !== batch?.id;
  }

  const q = search.toLowerCase().trim();
  const searchResults = q
    ? allMembers
        .filter((m) => !rosterIds.has(m.id))
        .filter((m) => m.name.toLowerCase().includes(q) || m.phone.includes(q))
        // In a kids class, suggest kids first; in an adult class, adults first.
        .sort((a, b) => {
          const aKid = a.batchIds.some((id) => kidBatchIds.has(id)) === isKidsClass ? 0 : 1;
          const bKid = b.batchIds.some((id) => kidBatchIds.has(id)) === isKidsClass ? 0 : 1;
          return aKid - bKid || a.name.localeCompare(b.name);
        })
        .slice(0, 12)
    : [];

  async function refresh() {
    if (!profile) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["attendance-record", batch?.id, profile.id] }),
      queryClient.invalidateQueries({ queryKey: ["attendance-map", profile.id] }),
    ]);
  }

  async function toggle(memberId: string) {
    if (!batch || !profile || savingIds.has(memberId) || presentElsewhere(memberId)) return;
    setError(null);
    const wasPresent = presentIds.has(memberId);
    setSavingIds((s) => new Set(s).add(memberId));
    setPresentIds((s) => {
      const next = new Set(s);
      wasPresent ? next.delete(memberId) : next.add(memberId);
      return next;
    });
    try {
      if (wasPresent) {
        const entryId = entryIdByMember.get(memberId);
        if (entryId) {
          const { error: delError } = await supabase.from("attendance_entries").delete().eq("id", entryId);
          if (delError) throw delError;
          setEntryIdByMember((m) => {
            const next = new Map(m);
            next.delete(memberId);
            return next;
          });
        }
      } else {
        if (!recordIdRef.current) recordIdRef.current = await ensureRecordId(batch.id, profile.id, date);
        const { data, error: insError } = await supabase
          .from("attendance_entries")
          .insert({ attendance_record_id: recordIdRef.current, member_id: memberId, present: true })
          .select("id")
          .single();
        if (insError && insError.code !== "23505") throw insError; // already ticked by someone else just now
        if (data) setEntryIdByMember((m) => new Map(m).set(memberId, data.id));
      }
      await refresh();
    } catch (e: any) {
      setPresentIds((s) => {
        const next = new Set(s);
        wasPresent ? next.add(memberId) : next.delete(memberId);
        return next;
      });
      setError(e?.message ?? "Couldn't save. Check your internet and try again.");
    } finally {
      setSavingIds((s) => {
        const next = new Set(s);
        next.delete(memberId);
        return next;
      });
    }
  }

  async function markAll() {
    if (!batch || !profile || unmarked.length === 0) return;
    setConfirmAll(false);
    setMarkingAll(true);
    setError(null);
    try {
      if (!recordIdRef.current) recordIdRef.current = await ensureRecordId(batch.id, profile.id, date);
      const { data, error: insError } = await supabase
        .from("attendance_entries")
        .upsert(
          unmarked.map((m) => ({ attendance_record_id: recordIdRef.current, member_id: m.id, present: true })),
          { onConflict: "attendance_record_id,member_id", ignoreDuplicates: true }
        )
        .select("id, member_id");
      if (insError) throw insError;
      setPresentIds((s) => new Set([...s, ...unmarked.map((m) => m.id)]));
      setEntryIdByMember((m) => {
        const next = new Map(m);
        (data ?? []).forEach((row: any) => next.set(row.member_id, row.id));
        return next;
      });
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "Couldn't mark everyone. Try again.");
    } finally {
      setMarkingAll(false);
    }
  }

  const loading = membersLoading || batchesLoading;
  const demoVisitors: any[] = (record as any)?.demo_visitors ?? [];

  return (
    <div className="space-y-4 pb-24">
      {/* Day */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl leading-none">{isToday ? "Today" : formatDate(date, "EEEE")}</h1>
          <p className="mt-1 text-sm text-white/50">{formatDate(date, "EEEE, d MMMM")}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            aria-label="Previous day"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-lg text-white/70 disabled:opacity-30"
            disabled={date <= minDate}
            onClick={() => setDate(shiftDate(date, -1))}
          >
            ‹
          </button>
          <button
            aria-label="Next day"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-lg text-white/70 disabled:opacity-30"
            disabled={isToday}
            onClick={() => setDate(shiftDate(date, 1))}
          >
            ›
          </button>
        </div>
      </div>
      {!isToday && (
        <button className="text-xs font-semibold text-accent-green" onClick={() => setDate(todayISO())}>
          ← Back to today
        </button>
      )}

      {/* Class picker */}
      {loading ? (
        <p className="text-white/50">Loading…</p>
      ) : dayBatches.length === 0 ? (
        <div className="card p-6 text-center text-white/50">No classes on this day.</div>
      ) : (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {dayBatches.map((b) => {
            const active = b.id === batch?.id;
            return (
              <button
                key={b.id}
                onClick={() => chooseBatch(b.id)}
                className={clsx(
                  "shrink-0 rounded-2xl border px-4 py-2.5 text-left transition",
                  active ? "border-transparent text-base-900 shadow-glow" : "border-white/10 bg-base-800 text-white"
                )}
                style={active ? { backgroundImage: "linear-gradient(110deg, #ffb15c, #f38320 45%, #e2531a)" } : undefined}
              >
                <div className="font-display text-xl leading-none tracking-wide">{slotStartLabel(b.time_slot)}</div>
                <div className={clsx("mt-0.5 text-[11px] font-semibold uppercase tracking-wider", active ? "text-base-900/70" : "text-white/45")}>
                  {classKind(b)}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {batch && (
        <>
          {/* Summary */}
          <div className="card flex items-center justify-between p-4">
            <div>
              <div className="font-display text-4xl leading-none">
                <span className="ember-text">{presentCount}</span>
                <span className="text-white/30"> / {roster.length}</span>
              </div>
              <div className="mt-1 text-xs text-white/50">here in {batch.time_slot}</div>
            </div>
            <div className="text-right">
              {nudgeCount > 0 ? (
                <div className="rounded-full bg-status-expired/15 px-3 py-1.5 text-xs font-semibold text-status-expired">
                  {nudgeCount} to talk to
                </div>
              ) : (
                <div className="text-xs text-white/40">Everyone's paid up</div>
              )}
              {unmarked.length > 1 && (
                <button className="mt-2 block text-xs font-semibold text-accent-green" onClick={() => setConfirmAll(true)} disabled={markingAll}>
                  {markingAll ? "Marking…" : "Mark all present"}
                </button>
              )}
            </div>
          </div>

          <p className="px-1 text-xs text-white/40">Tap a name to mark present. It saves straight away.</p>

          {/* Roster */}
          <div className="card divide-y divide-white/5 overflow-hidden">
            {recordLoading ? (
              <div className="px-4 py-8 text-center text-white/40">Loading class…</div>
            ) : roster.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-white/40">
                Nobody is assigned to this class yet. Use the search below to mark whoever came.
              </div>
            ) : (
              roster.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  due={dues.get(m.id)}
                  present={presentIds.has(m.id)}
                  saving={savingIds.has(m.id)}
                  elsewhere={presentElsewhere(m.id) ? presenceMap.get(m.id)?.batchName : undefined}
                  onToggle={() => toggle(m.id)}
                />
              ))
            )}
          </div>

          {unassigned.length > 0 && (
            <div className="space-y-2">
              <button
                className="flex w-full items-center justify-between px-1 text-left text-sm font-semibold text-white/60"
                onClick={() => setShowUnassigned((v) => !v)}
              >
                <span>No class time set yet ({unassigned.length})</span>
                <span>{showUnassigned ? "Hide" : "Show"}</span>
              </button>
              {showUnassigned && (
                <div className="card divide-y divide-white/5 overflow-hidden">
                  {unassigned.map((m) => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      due={dues.get(m.id)}
                      present={presentIds.has(m.id)}
                      saving={savingIds.has(m.id)}
                      elsewhere={presentElsewhere(m.id) ? presenceMap.get(m.id)?.batchName : undefined}
                      onToggle={() => toggle(m.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Someone else came */}
          <div className="space-y-2">
            <h2 className="px-1 text-xl leading-none text-white/80">Someone else came?</h2>
            <input
              className="input !rounded-2xl !py-3"
              placeholder="Search name or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              inputMode="search"
            />
            {q && (
              <div className="card divide-y divide-white/5 overflow-hidden">
                {searchResults.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-white/40">No member found. Add them as a demo visitor below.</div>
                ) : (
                  searchResults.map((m) => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      due={dues.get(m.id)}
                      present={presentIds.has(m.id)}
                      saving={savingIds.has(m.id)}
                      elsewhere={presentElsewhere(m.id) ? presenceMap.get(m.id)?.batchName : undefined}
                      onToggle={() => {
                        toggle(m.id);
                        setSearch("");
                      }}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          {/* Demo visitors */}
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm">Demo visitors</h3>
                <p className="text-xs text-white/40">{demoVisitors.length === 0 ? "None yet" : `${demoVisitors.length} today`}</p>
              </div>
              <button className="btn-secondary !rounded-full !py-2" onClick={() => setDemoOpen(true)}>
                + Add
              </button>
            </div>
            {demoVisitors.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {demoVisitors.map((v) => (
                  <li key={v.id} className="flex justify-between">
                    <span>{v.name}</span>
                    <a href={`tel:${v.phone}`} className="text-white/40">
                      {v.phone}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {error && (
        <div className="fixed inset-x-4 bottom-24 z-40 rounded-2xl border border-status-expired/40 bg-base-800 px-4 py-3 text-sm text-status-expired shadow-lg">
          {error}
          <button className="float-right text-white/50" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}

      {confirmAll && batch && (
        <Sheet onClose={() => setConfirmAll(false)}>
          <h2 className="text-3xl leading-none">Mark all present?</h2>
          <p className="mt-2 text-sm text-white/60">
            {unmarked.length} people in {batch.time_slot} will be marked present for {isToday ? "today" : formatDate(date, "d MMM")}.
            You can untick anyone who didn't come.
          </p>
          <button className="btn-primary mt-5 w-full !py-3" onClick={markAll}>
            Yes, mark all
          </button>
          <button className="btn-ghost mt-2 w-full !py-3" onClick={() => setConfirmAll(false)}>
            Cancel
          </button>
        </Sheet>
      )}

      {demoOpen && batch && profile && (
        <DemoSheet
          onClose={() => setDemoOpen(false)}
          onSave={async (name, phone) => {
            if (!recordIdRef.current) recordIdRef.current = await ensureRecordId(batch.id, profile.id, date);
            const { error: demoError } = await supabase
              .from("demo_visitors")
              .insert({ attendance_record_id: recordIdRef.current, name, phone, visit_date: date });
            if (demoError) throw demoError;
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function MemberRow({
  member,
  due,
  present,
  saving,
  elsewhere,
  onToggle,
}: {
  member: RosterMember;
  due?: number;
  present: boolean;
  saving: boolean;
  elsewhere?: string;
  onToggle: () => void;
}) {
  const expired = daysUntil(member.expiry_date) < 0;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={saving || !!elsewhere}
      className={clsx(
        "flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-white/5",
        present && "bg-accent-green/[0.07]",
        (saving || elsewhere) && "opacity-60"
      )}
    >
      <span
        className={clsx(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
          expired ? "bg-status-expired/15 text-status-expired" : "bg-white/[0.06] text-white/70"
        )}
      >
        {initials(member.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{member.name}</span>
        {elsewhere ? (
          <span className="mt-0.5 block text-xs text-white/45">Already marked in {elsewhere}</span>
        ) : (
          <MemberFlags expiryDate={member.expiry_date} due={due} />
        )}
      </span>
      <span
        className={clsx(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-base font-bold transition",
          present || elsewhere ? "border-transparent text-base-900" : "border-white/20 text-transparent"
        )}
        style={present || elsewhere ? { backgroundImage: "linear-gradient(110deg, #ffb15c, #f38320 45%, #e2531a)" } : undefined}
      >
        ✓
      </span>
    </button>
  );
}

function Sheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl border border-white/10 bg-base-800 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
        {children}
      </div>
    </div>
  );
}

function DemoSheet({ onClose, onSave }: { onClose: () => void; onSave: (name: string, phone: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <Sheet onClose={() => !saving && onClose()}>
      <h2 className="text-3xl leading-none">Demo visitor</h2>
      <p className="mt-1 text-sm text-white/50">Someone trying a free class today.</p>
      <div className="mt-4 space-y-3">
        <input className="input !py-3" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          className="input !py-3"
          placeholder="Phone number"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      {err && <p className="mt-2 text-sm text-status-expired">{err}</p>}
      <button
        className="btn-primary mt-5 w-full !py-3"
        disabled={saving || !name.trim() || !phone.trim()}
        onClick={async () => {
          setSaving(true);
          setErr(null);
          try {
            await onSave(name.trim(), phone.trim());
            onClose();
          } catch (e: any) {
            setErr(e?.message ?? "Couldn't save.");
            setSaving(false);
          }
        }}
      >
        {saving ? "Saving…" : "Save visitor"}
      </button>
      <button className="btn-ghost mt-2 w-full !py-3" onClick={onClose} disabled={saving}>
        Cancel
      </button>
    </Sheet>
  );
}
