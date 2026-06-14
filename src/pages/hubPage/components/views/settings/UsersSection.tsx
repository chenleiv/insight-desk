import { useState, useEffect } from "react";
import { Trash2, Search } from "lucide-react";
import { useAuth } from "../../../../../auth/useAuth";
import {
  getUsers,
  updateUser,
  deleteUser,
  type UserRecord,
} from "../../../../../api/authClient";
import { useStatus } from "../../../../../components/statusBar/useStatus";
import useConfirm from "../../../../../hooks/useConfirm";

export function UsersSection() {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
