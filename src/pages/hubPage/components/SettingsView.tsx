import { useState, useEffect, useActionState } from "react";
import { Eye, EyeOff, Trash2, Shield, User, Search, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "../../../auth/useAuth";
import {
  changePassword,
  updateProfile,
  getUsers,
  updateUser,
  deleteUser,
  type UserRecord,
} from "../../../api/authClient";
import { useStatus } from "../../../components/statusBar/useStatus";
import useConfirm from "../../../hooks/useConfirm";

type Tab = "account" | "users";

type Props = { isAdmin: boolean };

// ─── Password section ───────────────────────────────────────────────────────

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

function AccountSection() {
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
      {/* Profile header */}
      <div className="settings-profile">
        <div className="settings-avatar">{initials}</div>
        <div className="settings-profile-info">
          <div className="settings-profile-name">{resolvedName || user?.email}</div>
          {user?.jobTitle && <div className="settings-profile-job">{user.jobTitle}</div>}
          <div className="settings-profile-email">{user?.email}</div>
          <span className={`settings-role-badge ${user?.role}`}>{user?.role}</span>
        </div>
      </div>

      {/* Editable profile fields */}
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

      {/* Change password toggle */}
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

// ─── Users section ───────────────────────────────────────────────────────────

function UsersSection() {
  const { user: currentUser } = useAuth();
  const status = useStatus();
  const confirm = useConfirm();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<Set<number>>(new Set());

  useEffect(() => {
    getUsers()
      .then(setUsers)
      .catch((e) => status.show({ kind: "error", title: "Error", message: e.message }))
      .finally(() => setLoading(false));
  }, [status]);

  function setUserPending(id: number, val: boolean) {
    setPending((prev) => {
      const next = new Set(prev);
      if (val) next.add(id); else next.delete(id);
      return next;
    });
  }

  async function handleRoleChange(id: number, role: UserRecord["role"]) {
    setUserPending(id, true);
    try {
      await updateUser(id, { role });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
    } catch (e) {
      status.show({ kind: "error", title: "Error", message: e instanceof Error ? e.message : "Failed" });
    } finally {
      setUserPending(id, false);
    }
  }

  async function handleStatusToggle(id: number, current: UserRecord["status"]) {
    const next = current === "active" ? "inactive" : "active";
    setUserPending(id, true);
    try {
      await updateUser(id, { status: next });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, status: next } : u)));
    } catch (e) {
      status.show({ kind: "error", title: "Error", message: e instanceof Error ? e.message : "Failed" });
    } finally {
      setUserPending(id, false);
    }
  }

  async function handleDelete(id: number, email: string) {
    const ok = await confirm({
      title: "Delete user",
      message: `Remove ${email} permanently? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      status.show({ kind: "success", title: "Deleted", message: `${email} removed` });
    } catch (e) {
      status.show({ kind: "error", title: "Error", message: e instanceof Error ? e.message : "Failed" });
    }
  }

  const q = search.toLowerCase();
  const filtered = users.filter((u) =>
    u.email.toLowerCase().includes(q) ||
    (u.displayName ?? "").toLowerCase().includes(q)
  );

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <div>
          <h2>User Management</h2>
          <p>Manage roles and access for all users</p>
        </div>
        <span className="settings-user-count">{users.length} users</span>
      </div>

      <div className="settings-search">
        <Search size={15} className="settings-search-icon" />
        <input
          className="settings-search-input"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="settings-loading">Loading users…</div>
      ) : (
        <div className="settings-users-table">
          <div className="settings-users-thead">
            <span>User</span>
            <span>Role</span>
            <span>Status</span>
            <span></span>
          </div>
          {filtered.length === 0 ? (
            <div className="settings-users-empty">No users found</div>
          ) : (
            filtered.map((u) => {
              const isMe = u.email === currentUser?.email;
              const isPendingRow = pending.has(u.id);
              return (
                <div key={u.id} className={`settings-user-row ${isPendingRow ? "saving" : ""}`}>
                  <div className="settings-user-info">
                    <div className="settings-user-identity">
                      {u.displayName && (
                        <span className="settings-user-name">{u.displayName}</span>
                      )}
                      <span className="settings-user-email">{u.email}</span>
                    </div>
                    {isMe && <span className="settings-you-badge">You</span>}
                  </div>

                  <select
                    className="settings-role-select"
                    value={u.role}
                    disabled={isMe || isPendingRow}
                    onChange={(e) => handleRoleChange(u.id, e.target.value as UserRecord["role"])}
                  >
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>

                  <button
                    type="button"
                    className={`settings-status-btn ${u.status}`}
                    disabled={isMe || isPendingRow}
                    onClick={() => handleStatusToggle(u.id, u.status)}
                    title={u.status === "active" ? "Click to deactivate" : "Click to activate"}
                  >
                    {u.status}
                  </button>

                  <button
                    type="button"
                    className="settings-delete-btn icon-btn danger"
                    disabled={isMe || isPendingRow}
                    onClick={() => handleDelete(u.id, u.email)}
                    aria-label="Delete user"
                    title="Delete user"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function SettingsView({ isAdmin }: Props) {
  const [tab, setTab] = useState<Tab>("account");

  return (
    <div className="settings-view">
      <div className="settings-page-header">
        <h1>Settings</h1>
      </div>

      <div className="settings-tabs">
        <button
          type="button"
          className={`settings-tab ${tab === "account" ? "active" : ""}`}
          onClick={() => setTab("account")}
        >
          <User size={15} />
          Account
        </button>
        {isAdmin && (
          <button
            type="button"
            className={`settings-tab ${tab === "users" ? "active" : ""}`}
            onClick={() => setTab("users")}
          >
            <Shield size={15} />
            Users
          </button>
        )}
      </div>

      <div className="settings-content">
        {tab === "account" && <AccountSection />}
        {tab === "users" && isAdmin && <UsersSection />}
      </div>
    </div>
  );
}
