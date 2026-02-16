import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

const DocumentsPage = lazy(
  () => import("./pages/documentsPages/DocumentsPage"),
);
const AssistantPage = lazy(
  () => import("./pages/assistantPages/AssistantPage"),
);
const LoginPage = lazy(() => import("./pages/loginPage/LoginPage"));
const UsersPage = lazy(() => import("./pages/loginPage/UsersPage"));

import "./components/confirmModal/confirmDialog.scss";

import Header from "./components/header/Header";
import MobileNav from "./components/mobileNav/MobileNav";

import { useAuth } from "./auth/useAuth";
import RequireAuth from "./auth/RequireAuth";
import RequireRole from "./auth/RequireRole";
import { useMobile } from "./hooks/useMobile";
import { Loader } from "./components/loader/Loader";

function App() {
  const { isAuthed } = useAuth();
  const isMobile = useMobile();

  return (
    <div className="app-layout">
      <Header />

      <main>
        <Suspense
          fallback={
            <div
              style={{
                display: "flex",
                height: "100%",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Loader size={32} />
            </div>
          }
        >
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<RequireAuth />}>
              <Route path="/" element={<Navigate to="/documents" replace />} />
              <Route path="/documents" element={<DocumentsPage />} />

              {/* Admin-only: create */}
              <Route element={<RequireRole allow={["admin"]} />}>
                <Route path="/users" element={<UsersPage />} />
              </Route>
              <Route path="/assistant" element={<AssistantPage />} />
            </Route>

            <Route
              path="*"
              element={
                <Navigate to={isAuthed ? "/documents" : "/login"} replace />
              }
            />
          </Routes>
        </Suspense>
      </main>

      {isMobile && <MobileNav />}
    </div>
  );
}

export default App;
