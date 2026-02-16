import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import Menu from "../menu/Menu";
import { useMobile } from "../../hooks/useMobile";

type MenuItem =
  | { type: "link"; label: string; to: string; show?: boolean }
  | {
      type: "action";
      label: string;
      onClick: () => Promise<void> | void;
      danger?: boolean;
      show?: boolean;
    };

function getInitials(email: string) {
  const name = (email || "").split("@")[0] || "U";
  const parts = name.split(/[.\-_]/).filter(Boolean);
  const first = (parts[0]?.[0] ?? name[0] ?? "U").toUpperCase();
  const second = (parts[1]?.[0] ?? name[1] ?? "").toUpperCase();
  return (first + second).trim();
}

export default function UserMenu() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const isMobile = useMobile();

  const [open, setOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const btnRef = useRef<HTMLButtonElement | null>(null);

  const isAdmin = user?.role === "admin";

  const items: MenuItem[] = [
    { type: "link", label: "Users", to: "/users", show: isAdmin },
    {
      type: "action",
      label: isLoggingOut ? "Logging out..." : "Logout",
      danger: true,
      show: true,
      onClick: async () => {
        setIsLoggingOut(true);
        try {
          await logout();
          setOpen(false);
          nav("/login", { replace: true });
        } finally {
          setIsLoggingOut(false);
        }
      },
    },
  ];

  const visible = items.filter((it) => it.show !== false);

  if (!user) return null;

  const initials = getInitials(user.email);

  return (
    <div className="user-menu">
      <button
        ref={btnRef}
        className="user-menu__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        title={user.email}
        aria-label="User menu"
        aria-expanded={open}
        type="button"
      >
        <span className="user-menu__avatar" aria-hidden="true">
          {initials}
        </span>
      </button>

      <Menu
        anchorRef={btnRef}
        open={open}
        onClose={() => setOpen(false)}
        align={isMobile ? "center" : "right"}
        minWidth={240}
      >
        <div className="user-menu__panel">
          <div className="user-menu__header">
            <div className="user-menu__email" title={user.email}>
              {user.email}
            </div>
            <div className={`user-menu__role ${user.role}`}>
              {user.role.toUpperCase()}
            </div>
          </div>

          <div className="user-menu__spacer" />

          <div className="user-menu__items">
            {visible.map((it, idx) => {
              if (it.type === "link") {
                return (
                  <Link
                    key={`link-${idx}`}
                    className="user-menu__item"
                    to={it.to}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                  >
                    {it.label}
                  </Link>
                );
              }

              const disabled = isLoggingOut;
              return (
                <button
                  key={`action-${idx}`}
                  className={`user-menu__item ${it.danger ? "danger" : ""}`}
                  role="menuitem"
                  type="button"
                  disabled={disabled}
                  onClick={it.onClick}
                >
                  {it.label}
                </button>
              );
            })}
          </div>
        </div>
      </Menu>
    </div>
  );
}
