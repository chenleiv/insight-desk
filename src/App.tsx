import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

const HubPage = lazy(() => import("./pages/hubPage/HubPage"));
const LoginPage = lazy(() => import("./pages/loginPage/LoginPage"));
const UsersPage = lazy(() => import("./pages/loginPage/UsersPage"));

import "./components/confirmModal/confirmDialog.scss";
import "./components/popover/popover.scss";
import Header from "./components/header/Header";

import { useAuth } from "./auth/useAuth";
import RequireAuth from "./auth/RequireAuth";
import RequireRole from "./auth/RequireRole";
import { Loader } from "./components/loader/Loader";
import { useDocuments } from "./context/DocumentsContext";

function App() {
  const { isAuthed } = useAuth();

  const { loadDocuments, docs } = useDocuments();

  useEffect(() => {
    if (isAuthed && docs.length === 0) {
      void loadDocuments();
    }
  }, [isAuthed, loadDocuments, docs.length]);

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
              <Route path="/" element={<Navigate to="/hub" replace />} />
              <Route path="/hub" element={<HubPage />} />

              <Route element={<RequireRole allow={["admin"]} />}>
                <Route path="/users" element={<UsersPage />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/hub" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

export default App;
