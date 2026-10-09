import React from "react";
import ReactDOM from "react-dom/client";
import BillingPage from "./pages/BillingPage";
import "./styles.css";
import { AuthGate } from "./components/AuthGate";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthGate>
      <BillingPage />
    </AuthGate>
  </React.StrictMode>,
);
