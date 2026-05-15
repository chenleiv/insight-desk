import { useActionState, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { login, register } from "../../api/authClient";
import { useAuth } from "../../auth/useAuth";
import { useStatus } from "../../components/statusBar/useStatus";
import "./loginPage.scss";

export type LoginLocationState = { from?: Location };

export default function LoginPage() {
  const nav = useNavigate();
  const location = useLocation();
  const status = useStatus();

  const { isAuthed, loginSuccess } = useAuth();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const redirectTo = (() => {
    const state = location.state as LoginLocationState | null;
    return state?.from?.pathname ?? "/hub";
  })();

  const [error, formAction, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      const emailVal = formData.get("email") as string;
      const passVal = formData.get("password") as string;

      try {
        if (mode === "register") {
          const confirmVal = formData.get("confirm") as string;
          const displayNameVal = (formData.get("displayName") as string)?.trim();
          if (passVal !== confirmVal) return "Passwords do not match";
          const res = await register(emailVal.trim(), passVal, displayNameVal || undefined);
          loginSuccess(res.user);
        } else {
          const res = await login(emailVal.trim(), passVal);
          loginSuccess(res.user);
        }
        nav(redirectTo, { replace: true });
        return null;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Authentication failed";
        status.show({ kind: "error", title: "Error", message });
        return message;
      }
    },
    null,
  );

  useEffect(() => {
    if (isAuthed) nav(redirectTo, { replace: true });
  }, [isAuthed, nav, redirectTo]);

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setShowPassword(false);
    setShowConfirm(false);
  };

  return (
    <div className="login-panel">
      <div className="login-tabs">
        <button
          className={`login-tab${mode === "login" ? " active" : ""}`}
          type="button"
          onClick={() => switchMode("login")}
        >
          Sign In
        </button>
        <button
          className={`login-tab${mode === "register" ? " active" : ""}`}
          type="button"
          onClick={() => switchMode("register")}
        >
          Sign Up
        </button>
      </div>

      <form className="login-form" action={formAction}>
        {error && <div className="login-error">{error}</div>}

        <label className="login-field">
          Email
          <input
            name="email"
            className="login-input"
            type="email"
            placeholder="you@example.com"
            autoComplete={mode === "register" ? "email" : "username"}
          />
        </label>

        {mode === "register" && (
          <label className="login-field">
            Name
            <input
              name="displayName"
              className="login-input"
              type="text"
              placeholder="Your name"
              autoComplete="name"
              maxLength={80}
            />
          </label>
        )}

        <label className="login-field">
          Password
          <div className="password-input-wrapper">
            <input
              name="password"
              className="login-input"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
            <button
              type="button"
              className="eye-btn"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>

        {mode === "register" && (
          <label className="login-field">
            Confirm Password
            <div className="password-input-wrapper">
              <input
                name="confirm"
                className="login-input"
                type={showConfirm ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="new-password"
              />
              <button
                type="button"
                className="eye-btn"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? "Hide password" : "Show password"}
              >
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
        )}

        {mode === "login" && (
          <div className="login-options">
            <a href="#" className="forgot-password accent-link">
              Forgot password?
            </a>
          </div>
        )}

        <button
          className="primary-btn signin-btn"
          type="submit"
          disabled={isPending}
        >
          {isPending
            ? mode === "register"
              ? "Creating account..."
              : "Signing in..."
            : mode === "register"
              ? "Create Account"
              : "Sign In"}
        </button>

      </form>
    </div>
  );
}
