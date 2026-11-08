import { useEffect, useRef, useState } from "react";
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
import { Skeleton, SkeletonLine, SkeletonRegion } from "../../../../../components/skeleton/Skeleton";
import { LoadError } from "../../../../../components/loadError/LoadError";

const SKELETON_ROWS = 4;

function UsersTableHead() {
  return (
    <div className="settings-users-thead">
      <span>User</span>
      <span>Role</span>
      <span>Status</span>
      <span></span>
    </div>
  );
}

// Same grid and control classes as a loaded row, so mobile placement matches too.
function UsersSkeleton() {
  return (
    <SkeletonRegion label="Loading users…" className="settings-users-table">
      <UsersTableHead />
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <div key={i} className="settings-user-row skeleton-static">
          <div className="settings-user-info">
            <div className="settings-user-identity">
              <span className="settings-user-name"><SkeletonLine width={120} /></span>
              <span className="settings-user-email"><SkeletonLine width={180} /></span>
            </div>
          </div>
          <span className="settings-role-select"><SkeletonLine width={56} /></span>
          <span className="settings-status-btn"><SkeletonLine width="100%" /></span>
          <span className="settings-delete-btn"><Skeleton width={15} height={15} /></span>
        </div>
      ))}
    </SkeletonRegion>
  );
}

export function UsersSection({ readOnly = false }: { readOnly?: boolean }) {
  const { user: currentUser } = useAuth();
  const status = useStatus();
  const confirm = useConfirm();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState<Set<number>>(new Set());
  // Set before the confirm dialog: a second click must not open another one.
  const deleteInFlightRef = useRef(new Set<number>());

  const [loadFailed, setLoadFailed] = useState(false);
  // Each retry raises this, which runs the request again.
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    getUsers()
      .then(setUsers)
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  }, [loadAttempt]);

  function retryLoad() {
    setLoading(true);
    setLoadFailed(false);
    setLoadAttempt((n) => n + 1);
  }

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

  function setUserDeleting(id: number, val: boolean) {
    setDeleting((prev) => {
      const next = new Set(prev);
      if (val) next.add(id); else next.delete(id);
      return next;
    });
  }

  async function handleDelete(id: number, email: string) {
    if (deleteInFlightRef.current.has(id)) return;
    deleteInFlightRef.current.add(id);
    try {
      const ok = await confirm({
        title: "Delete user",
        message: `Remove ${email} permanently? This cannot be undone.`,
        confirmLabel: "Delete",
        variant: "danger",
      });
      if (!ok) return;
      setUserDeleting(id, true);
      await deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      status.show({ kind: "success", title: "Deleted", message: `${email} removed` });
    } catch (e) {
      status.show({ kind: "error", title: "Error", message: e instanceof Error ? e.message : "Failed" });
    } finally {
      deleteInFlightRef.current.delete(id);
      setUserDeleting(id, false);
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
          {readOnly && <p className="settings-readonly-note">Admin only · Sample users shown in the demo, changes are disabled</p>}
        </div>
        <span className="settings-user-count">
          {loading ? <SkeletonLine width={52} /> : loadFailed ? "—" : `${users.length} users`}
        </span>
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
        <UsersSkeleton />
      ) : loadFailed ? (
        <LoadError message="Could not load the users." onRetry={retryLoad} />
      ) : (
        <div className="settings-users-table">
          <UsersTableHead />
          {filtered.length === 0 ? (
            <div className="settings-users-empty">No users found</div>
          ) : (
            filtered.map((u) => {
              const isMe = u.email === currentUser?.email;
              const isDeleting = deleting.has(u.id);
              const isPendingRow = pending.has(u.id) || isDeleting;
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
                    {isDeleting && <span className="settings-user-deleting">Deleting…</span>}
                  </div>

                  <select
                    className="settings-role-select"
                    value={u.role}
                    disabled={readOnly || isMe || isPendingRow}
                    onChange={(e) => handleRoleChange(u.id, e.target.value as UserRecord["role"])}
                  >
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>

                  <button
                    type="button"
                    className={`settings-status-btn ${u.status}`}
                    disabled={readOnly || isMe || isPendingRow}
                    onClick={() => handleStatusToggle(u.id, u.status)}
                    title={u.status === "active" ? "Click to deactivate" : "Click to activate"}
                  >
                    {u.status}
                  </button>

                  <button
                    type="button"
                    className="settings-delete-btn icon-btn danger"
                    disabled={readOnly || isMe || isPendingRow}
                    onClick={() => handleDelete(u.id, u.email)}
                    aria-busy={isDeleting}
                    aria-label={isDeleting ? "Deleting user…" : "Delete user"}
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
