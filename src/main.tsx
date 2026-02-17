import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import "./styles/globals.scss";
import "./styles/theme.scss";
import "./styles/layout.scss";
import { ConfirmProvider } from "./components/confirmModal/ConfirmProvider.tsx";
import { AuthProvider } from "./auth/AuthProvider.tsx";
import { StatusProvider } from "./components/statusBar/StatusProvider";
import { DocumentsProvider } from "./context/DocumentsProvider";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <DocumentsProvider>
        <ConfirmProvider>
          <StatusProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </StatusProvider>
        </ConfirmProvider>
      </DocumentsProvider>
    </AuthProvider>
  </React.StrictMode>,
);
