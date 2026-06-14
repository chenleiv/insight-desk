import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import { useAuth } from "../../auth/useAuth";
import "./UsersPage.scss";

type UserRecord = {
  id: number;
  email: string;
  role: "admin" | "viewer";
  password: string;
  status: "active" | "inactive";
  joinedDate: string;
};

const MOCK_USERS: UserRecord[] = [
  {
    id: 1,
    email: "admin@demo.com",
    role: "admin",
    password: "admin123",
    status: "active",
    joinedDate: "15-01-2026",
  },
  {
    id: 2,
    email: "viewer@demo.com",
    role: "viewer",
    password: "viewer123",
    status: "active",
    joinedDate: "10-02-2026",
  },
];

export default function UsersPage() {
  const { user: currentUser, isReady } = useAuth();
  const navigate = useNavigate();
  const [users] = useState<UserRecord[]>(MOCK_USERS);
  const [searchTerm, setSearchTerm] = useState("");
  const [visiblePasswords, setVisiblePasswords] = useState<Set<number>>(
    new Set(),
  );

  if (!isReady) return <div className="loading">Loading...</div>;

  // Extra guard: only admin can see this page
  if (!currentUser || currentUser.role !== "admin") {
    return <Navigate to="/documents" replace />;
  }

  const filteredUsers = users.filter((u) =>
    u.email.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const togglePasswordVisibility = (id: number) => {
    setVisiblePasswords((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isAdmin = currentUser.role === "admin";

  return (
    <div className="users-page">
      <div className="page-top-nav">
        <button
          type="button"
          className="btn-back-prominent"
          onClick={() => navigate("/documents")}
        >
          <ArrowLeft size={16} />
          <span>Back to Insights Hub</span>
        </button>
      </div>

      <header className="header-section">
        <h1>
          Directory <span>{users.length} users</span>
        </h1>
      </header>

      <div className="search-section">
        <input
          type="text"
          placeholder="Search by email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="users-table-container">
        <table>
          <thead>
            <tr>
              <th>User</th>
              {isAdmin && <th>Password</th>}
              <th>Status</th>
              <th>Joined Date</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length > 0 ? (
              filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td data-label="User">
                    <div className="user-info">
                      <span className="email">{user.email}</span>
                      <span className={`role-badge ${user.role}`}>
                        {user.role}
                        {user.email === currentUser?.email && " (You)"}
                      </span>
                    </div>
                  </td>
                  {isAdmin && (
                    <td data-label="Password">
                      <div className="user-password">
                        <input
                          type={
                            visiblePasswords.has(user.id) ? "text" : "password"
                          }
                          value={user.password}
                          readOnly
                        />
                        <button
                          type="button"
                          className="toggle-visibility"
                          onClick={() => togglePasswordVisibility(user.id)}
                          aria-label={
                            visiblePasswords.has(user.id)
                              ? "Hide password"
                              : "Show password"
                          }
                        >
                          {visiblePasswords.has(user.id) ? (
                            <EyeOff size={16} />
                          ) : (
                            <Eye size={16} />
                          )}
                        </button>
                      </div>
                    </td>
                  )}
                  <td data-label="Status">
                    <span className={`status-badge ${user.status}`}>
                      {user.status}
                    </span>
                  </td>
                  <td data-label="Joined Date">
                    <span className="joined-date">{user.joinedDate}</span>
                  </td>
                </tr>
              ))
            ) : (
              <tr className="empty-row">
                <td colSpan={isAdmin ? 4 : 3}>
                  No users found matching "{searchTerm}"
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
