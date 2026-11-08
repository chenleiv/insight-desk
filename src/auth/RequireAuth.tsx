import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";
import { Loader } from "../components/loader/Loader";
import { LoadError } from "../components/loadError/LoadError";

export default function RequireAuth() {
  const { isReady, isAuthed, signedOut, sessionCheckFailed, retrySessionCheck } = useAuth();
  const location = useLocation();

  if (sessionCheckFailed) {
    return (
      <div className="suspense-loader">
        <LoadError message="Could not reach the server." onRetry={() => retrySessionCheck?.()} />
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="suspense-loader" role="status" aria-label="Checking your session…">
        <Loader size={32} />
      </div>
    );
  }

  if (!isAuthed) {
    // Signing out ends the visit: the next sign-in starts fresh instead of returning to this page.
    return <Navigate to="/login" replace state={signedOut ? undefined : { from: location }} />;
  }

  return <Outlet />;
}
