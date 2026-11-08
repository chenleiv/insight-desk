import { useActionState, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, BrainCircuit, Sun, Moon } from "lucide-react";
import { login, startDemo } from "../../api/authClient";
import { useAuth } from "../../auth/useAuth";
import { safeReturnPath } from "../../auth/returnPath";
import { useStatus } from "../../components/statusBar/useStatus";
import { useTheme } from "../../hooks/useTheme";
import { Loader } from "../../components/loader/Loader";
import "./loginPage.scss";

export type LoginLocationState = { from?: Location };

export default function LoginPage() {
  const nav = useNavigate();
  const location = useLocation();
  const status = useStatus();

  const { isAuthed, sessionExpired, loginSuccess } = useAuth();
  const { theme, setTheme } = useTheme();

  const [showPassword, setShowPassword] = useState(false);
  const [demoPending, setDemoPending] = useState(false);
  const [slow, setSlow] = useState(false);

  const redirectTo = safeReturnPath((location.state as LoginLocationState | null)?.from);

  const [error, formAction, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      const emailVal = formData.get("email") as string;
      const passVal = formData.get("password") as string;

      try {
        const res = await login(emailVal.trim(), passVal);
        loginSuccess(res.user);
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

  const waiting = isPending || demoPending;

  // A sleeping server can take up to a minute to wake, so explain longer waits.
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setSlow(true), 5000);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [waiting]);

  const startDemoSession = async () => {
    setDemoPending(true);
    try {
      const res = await startDemo();
      loginSuccess(res.user);
      nav(redirectTo, { replace: true });
    } catch {
      status.show({ kind: "error", title: "Demo unavailable", message: "Could not connect to demo account." });
    } finally {
      setDemoPending(false);
    }
  };

  return (
    <div className="login-page-wrapper">
      <div className="login-logo">
        <BrainCircuit size={28} />
        InsightDesk
        <button
          type="button"
          className="login-theme-btn"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun size={16} strokeWidth={2} /> : <Moon size={16} strokeWidth={2} />}
        </button>
      </div>
    <div className="login-panel">
      <form className="login-form" action={formAction}>
        {sessionExpired && (
          <div className="login-notice" role="status">
            Your session expired. Please sign in again.
          </div>
        )}
        {error && <div className="login-error">{error}</div>}

        <label className="login-field">
          Email
          <input
            name="email"
            className="login-input"
            type="email"
            placeholder="you@example.com"
            autoComplete="username"
          />
        </label>

        <label className="login-field">
          Password
          <div className="password-input-wrapper">
            <input
              name="password"
              className="login-input"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              autoComplete="current-password"
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

        <button
          className="primary-btn signin-btn"
          type="submit"
          disabled={isPending || demoPending}
        >
          {isPending ? "Signing in..." : "Sign In"}
        </button>
        {slow && isPending && (
          <p className="login-wait" role="status">
            Still working…
          </p>
        )}

      </form>

      <div className="login-demo-section">
        <div className="login-demo-divider">
          <span>or</span>
        </div>
        <button
          type="button"
          className="login-demo-btn"
          disabled={isPending || demoPending}
          aria-busy={demoPending}
          onClick={startDemoSession}
        >
          {demoPending ? (
            <>
              <Loader size={16} />
              Preparing your demo workspace...
            </>
          ) : (
            "Try Demo"
          )}
        </button>
        {slow && demoPending && (
          <p className="login-wait" role="status">
            The server may be waking up. This can take up to a minute.
          </p>
        )}
      </div>
    </div>
    </div>
  );
}
