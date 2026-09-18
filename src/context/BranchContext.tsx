import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { useMyBranches } from "@/hooks/useTrainerData";
import type { Branch } from "@/lib/database.types";

interface BranchContextValue {
  branches: Branch[];
  loading: boolean;
  selectedBranchId: string | null;
  selectedBranch: Branch | null;
  selectBranch: (branchId: string) => void;
}

const BranchContext = createContext<BranchContextValue | undefined>(undefined);

function storageKey(trainerId: string) {
  return `selected-branch-${trainerId}`;
}

export function BranchProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const { data: branches = [], isLoading } = useMyBranches(profile?.id);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  // Restore a remembered selection, or auto-pick when there's only one branch.
  useEffect(() => {
    if (!profile?.id || isLoading) return;

    if (branches.length === 1) {
      setSelectedBranchId(branches[0].id);
      return;
    }

    const remembered = localStorage.getItem(storageKey(profile.id));
    if (remembered && branches.some((b) => b.id === remembered)) {
      setSelectedBranchId(remembered);
    } else {
      setSelectedBranchId(null);
    }
  }, [profile?.id, isLoading, branches]);

  function selectBranch(branchId: string) {
    setSelectedBranchId(branchId);
    if (profile?.id) {
      try {
        localStorage.setItem(storageKey(profile.id), branchId);
      } catch {
        // Best-effort only — a failed write just means the choice won't be remembered next visit.
      }
    }
  }

  const selectedBranch = branches.find((b) => b.id === selectedBranchId) ?? null;

  const value = useMemo<BranchContextValue>(
    () => ({ branches, loading: isLoading, selectedBranchId, selectedBranch, selectBranch }),
    [branches, isLoading, selectedBranchId, selectedBranch]
  );

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch must be used within BranchProvider");
  return ctx;
}
