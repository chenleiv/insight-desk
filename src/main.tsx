import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import "./styles/globals.scss";
import "./styles/theme.scss";
import "./styles/layout.scss";
import { ConfirmProvider } from "./components/confirmModal/ConfirmProvider.tsx";
import { AuthProvider } from "./auth/AuthProvider.tsx";
import { StatusProvider } from "./components/statusBar/StatusProvider";

const queryClient = new QueryClient();

// A data router enables useBlocker (unsaved-changes guard); App still declares its own <Routes>.
const router = createBrowserRouter([{ path: "*", element: <App /> }]);

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
