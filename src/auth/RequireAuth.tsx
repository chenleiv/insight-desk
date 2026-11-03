import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";

export default function RequireAuth() {
  const { isReady, isAuthed, signedOut } = useAuth();
  const location = useLocation();

  if (!isReady) return null;

  if (!isAuthed) {
    // Signing out ends the visit: the next sign-in starts fresh instead of returning to this page.
    return <Navigate to="/login" replace state={signedOut ? undefined : { from: location }} />;
  }

  return <Outlet />;
}
