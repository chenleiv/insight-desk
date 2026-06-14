import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";

export default function RequireAuth() {
  const { isReady, isAuthed } = useAuth();
  const location = useLocation();

  if (!isReady) return null;

  if (!isAuthed) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
