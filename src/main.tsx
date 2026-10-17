import React from "react";
import ReactDOM from "react-dom/client";
import BillingPage from "./pages/BillingPage";
import "./styles.css";
import { AuthGate } from "./components/AuthGate";
import { initializeSnapshots } from "./utils/browserSnapshots";

const root = ReactDOM.createRoot(document.getElementById("root")!);
initializeSnapshots()
  .then(() =>
    root.render(
      <React.StrictMode>
        <AuthGate>
          <BillingPage />
        </AuthGate>
      </React.StrictMode>,
    ),
  )
  .catch(() =>
    root.render(
      <main role="alert">
        <h1>Could not open browser storage</h1>
        <p>
          Your existing data has been preserved. Allow browser storage for this
          site and reload to retry.
        </p>
        <button onClick={() => location.reload()}>Retry</button>
      </main>,
    ),
  );
