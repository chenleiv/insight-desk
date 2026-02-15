import { Navigate, Route, Routes } from "react-router-dom";

import DocumentsPage from "./pages/documentsPages/DocumentsPage";
import AssistantPage from "./pages/assistantPages/AssistantPage";
import LoginPage from "./pages/loginPage/LoginPage";
import UsersPage from "./pages/loginPage/UsersPage";

import "./components/confirmModal/confirmDialog.scss";

import Header from "./components/header/Header";
import MobileNav from "./components/mobileNav/MobileNav";

import { useAuth } from "./auth/useAuth";
import RequireAuth from "./auth/RequireAuth";
import RequireRole from "./auth/RequireRole";
import { useMobile } from "./hooks/useMobile";

function App() {
  const { isAuthed } = useAuth();
  const isMobile = useMobile();

  return (
    <div className="app-layout">
      <Header />

      <main>
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
      </main>

      {isMobile && <MobileNav />}
    </div>
  );
}

export default App;
