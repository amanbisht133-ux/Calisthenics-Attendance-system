import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";

// Anyone's attendance tick shows up on every signed-in phone straight away:
// the database broadcasts changes and we refresh whatever is on screen.
const LIVE_KEYS = ["attendance", "admin-overview", "demo-visitors", "ranking", "leaderboard", "exception", "member-profile", "reports"];

export function useLiveAttendance() {
  const queryClient = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        queryClient.invalidateQueries({
          predicate: (q) => {
            const k = String(q.queryKey[0] ?? "").toLowerCase();
            return LIVE_KEYS.some((x) => k.includes(x));
          },
        });
      }, 250);
    };
    const channel = supabase
      .channel("live-attendance")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_entries" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_records" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "demo_visitors" }, refresh)
      .subscribe();
    // Phones that were asleep catch up the moment the app is opened again.
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
