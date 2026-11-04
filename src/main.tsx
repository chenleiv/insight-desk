import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import "@fontsource-variable/inter/wght.css";
import "./styles/globals.scss";
import "./styles/theme.scss";
import "./styles/layout.scss";
import { ConfirmProvider } from "./components/confirmModal/ConfirmProvider.tsx";
import { AuthProvider } from "./auth/AuthProvider.tsx";
import { StatusProvider } from "./components/statusBar/StatusProvider";
import { ErrorPage } from "./components/errorPage/ErrorPage";
import { installStaleAssetReload } from "./utils/staleAssetReload";

installStaleAssetReload();

const queryClient = new QueryClient();

// A data router enables useBlocker (unsaved-changes guard); App still declares its own <Routes>.
const router = createBrowserRouter([{ path: "*", element: <App />, errorElement: <ErrorPage /> }]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ConfirmProvider>
          <StatusProvider>
            <RouterProvider router={router} />
          </StatusProvider>
        </ConfirmProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
