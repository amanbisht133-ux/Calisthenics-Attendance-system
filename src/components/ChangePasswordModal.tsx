import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Modal } from "@/components/ui/Modal";

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSave() {
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setDone(true);
    } catch (e: any) {
      setError(e.message ?? "Failed to change password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Change Password" onClose={onClose}>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-accent-green">Password changed. Use your new password next time you sign in.</p>
          <button className="btn-primary w-full" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="label">New Password</label>
            <input
              type="password"
              className="input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input
              type="password"
              className="input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-status-expired">{error}</p>}
          <button className="btn-primary w-full" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Change Password"}
          </button>
        </div>
      )}
    </Modal>
  );
}
