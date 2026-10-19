import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { AuthGate } from "./components/AuthGate";
import { AppSupport } from "./components/AppSupport";
import { initializeSnapshots } from "./utils/browserSnapshots";

// Recover in parallel with login, but never mount the editor before recovery.
const recovery = initializeSnapshots().then(
  () => true,
  () => false,
);
let workspace: Promise<{ default: React.ComponentType }> | undefined;
const preloadWorkspace = () =>
  (workspace ??= import("./pages/BillingPage").catch(() => ({
    default: WorkspaceError,
  })));
const BillingPage = lazy(async () => {
  const [recovered, module] = await Promise.all([recovery, preloadWorkspace()]);
  return recovered ? module : { default: StorageError };
});
function WorkspaceError() {
  return (
    <main role="alert">
      <h1>Workspace could not load</h1>
      <p>
        Check your connection and reload. Existing saved drafts are preserved.
      </p>
      <button onClick={() => location.reload()}>Retry</button>
    </main>
  );
}
function StorageError() {
  return (
    <main role="alert">
      <h1>Could not open browser storage</h1>
      <p>
        Your existing data has been preserved. Allow browser storage for this
        site and reload to retry.
      </p>
      <button onClick={() => location.reload()}>Retry</button>
    </main>
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppSupport />
    <AuthGate
      onLoginIntent={() => {
        void preloadWorkspace();
      }}
    >
      <Suspense
        fallback={
          <p className="startup-status" role="status">
            Opening workspace and recovering your draft…
          </p>
        }
      >
        <BillingPage />
      </Suspense>
    </AuthGate>
  </React.StrictMode>,
);
