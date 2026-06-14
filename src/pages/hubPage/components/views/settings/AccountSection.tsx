import { useState, useActionState } from "react";
import { Eye, EyeOff, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "../../../../../auth/useAuth";
import { changePassword, updateProfile } from "../../../../../api/authClient";
import { useStatus } from "../../../../../components/statusBar/useStatus";

function PasswordField({
  label,
  name,
  autoComplete,
}: {
  label: string;
  name: string;
  autoComplete: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="settings-field">
      {label}
      <div className="settings-password-wrap">
        <input
          name={name}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required
          className="settings-input"
          placeholder="••••••••"
        />
        <button
          type="button"
          className="settings-eye-btn"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide" : "Show"}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </label>
  );
}

export function AccountSection() {
  const { user, updateUser: updateAuthUser } = useAuth();
  const status = useStatus();
  const [pwOpen, setPwOpen] = useState(false);
  const [pwKey, setPwKey] = useState(0);

  const [profileName, setProfileName] = useState(user?.displayName ?? "");
  const [profileTitle, setProfileTitle] = useState(user?.jobTitle ?? "");
  const [profileSaving, setProfileSaving] = useState(false);

  const profileDirty =
    profileName !== (user?.displayName ?? "") ||
    profileTitle !== (user?.jobTitle ?? "");

  async function saveProfile() {
    setProfileSaving(true);
    try {
      const res = await updateProfile({ displayName: profileName, jobTitle: profileTitle });
      updateAuthUser({ displayName: res.displayName, jobTitle: res.jobTitle });
      status.show({ kind: "success", title: "Saved", message: "Profile updated" });
    } catch (e) {
      status.show({ kind: "error", title: "Error", message: e instanceof Error ? e.message : "Failed" });
    } finally {
      setProfileSaving(false);
    }
  }

  const resolvedName = user?.displayName || (() => {
    const local = (user?.email ?? "").split("@")[0] || "";
    return local.replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  })();

  const initials = (() => {
    const parts = resolvedName.trim().split(" ").filter(Boolean);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
  })() || "?";

  const [error, formAction, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      const current = formData.get("current") as string;
      const next = formData.get("next") as string;
      const confirm = formData.get("confirm") as string;

      if (next.length < 6) return "New password must be at least 6 characters";
      if (next !== confirm) return "Passwords do not match";

      try {
        await changePassword(current, next);
        status.show({ kind: "success", title: "Done", message: "Password updated successfully" });
        setPwKey((k) => k + 1);
        setPwOpen(false);
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "Failed to update password";
      }
    },
    null,
  );

  return (
    <div className="settings-card">
      <div className="settings-profile">
        <div className="settings-avatar">{initials}</div>
        <div className="settings-profile-info">
          <div className="settings-profile-name">{resolvedName || user?.email}</div>
          {user?.jobTitle && <div className="settings-profile-job">{user.jobTitle}</div>}
          <div className="settings-profile-email">{user?.email}</div>
          <span className={`settings-role-badge ${user?.role}`}>{user?.role}</span>
        </div>
      </div>

      <div className="settings-profile-fields">
        <div className="settings-info-row">
          <span className="settings-info-label">Name</span>
          <input
            className="settings-inline-input"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="Your name"
            maxLength={80}
          />
        </div>
        <div className="settings-info-row">
          <span className="settings-info-label">Job title</span>
          <input
            className="settings-inline-input"
            value={profileTitle}
            onChange={(e) => setProfileTitle(e.target.value)}
            placeholder="e.g. Developer"
            maxLength={80}
          />
        </div>
        <div className="settings-info-row">
          <span className="settings-info-label">Email</span>
          <span className="settings-info-value">{user?.email}</span>
        </div>
        <div className="settings-info-row">
          <span className="settings-info-label">Role</span>
          <span className="settings-info-value">{user?.role === "admin" ? "Administrator" : "Viewer"}</span>
        </div>
        {profileDirty && (
          <div className="settings-profile-save-row">
            <button
              type="button"
              className="settings-save-btn"
              disabled={profileSaving}
              onClick={saveProfile}
            >
              {profileSaving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              className="settings-cancel-btn"
              onClick={() => {
                setProfileName(user?.displayName ?? "");
                setProfileTitle(user?.jobTitle ?? "");
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="settings-pw-section">
        <button
          type="button"
          className="settings-pw-toggle"
          onClick={() => setPwOpen((v) => !v)}
        >
          <span>Change password</span>
          {pwOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>

        {pwOpen && (
          <form key={pwKey} action={formAction} className="settings-form settings-pw-form">
            {error && <div className="settings-error">{error}</div>}
            <PasswordField label="Current password" name="current" autoComplete="current-password" />
            <PasswordField label="New password" name="next" autoComplete="new-password" />
            <PasswordField label="Confirm new password" name="confirm" autoComplete="new-password" />
            <div className="settings-pw-actions">
              <button type="submit" className="settings-save-btn" disabled={isPending}>
                {isPending ? "Saving…" : "Update password"}
              </button>
              <button type="button" className="settings-cancel-btn" onClick={() => setPwOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
