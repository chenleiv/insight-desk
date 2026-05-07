import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

const HubPage = lazy(() => import("./pages/hubPage/HubPage"));
const LoginPage = lazy(() => import("./pages/loginPage/LoginPage"));
const UsersPage = lazy(() => import("./pages/loginPage/UsersPage"));

import "./components/confirmModal/confirmDialog.scss";
import "./components/popover/popover.scss";
import "./components/userMenu/userMenu.scss";
import Header from "./components/header/Header";

import RequireAuth from "./auth/RequireAuth";
import RequireRole from "./auth/RequireRole";
import { Loader } from "./components/loader/Loader";

function App() {
  const location = useLocation();
  const isHub = location.pathname === "/hub";

  return (
    <div className={`app-layout ${isHub ? "hub-fullscreen" : ""}`}>
      {!isHub && <Header />}
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
