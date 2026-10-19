import { useEffect, useState } from "react";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function AppSupport() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  );
  const [offline, setOffline] = useState(!navigator.onLine);
  const [help, setHelp] = useState(false);
  const [update, setUpdate] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const install = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
      setHelp(false);
    };
    const network = () => setOffline(!navigator.onLine);
    window.addEventListener("beforeinstallprompt", install);
    window.addEventListener("appinstalled", done);
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    return () => {
      window.removeEventListener("beforeinstallprompt", install);
      window.removeEventListener("appinstalled", done);
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
    };
  }, []);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let active = true;
    const register = () => {
      void navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((registration) => {
          if (!active) return;
          if (registration.waiting) setUpdate(true);
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (
                active &&
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              )
                setUpdate(true);
            });
          });
        })
        .catch(() => {
          if (active)
            setError(
              "Offline app files could not be prepared. Check your connection and reopen the app to retry.",
            );
        });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => {
      active = false;
      window.removeEventListener("load", register);
    };
  }, []);
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return (
    <aside className="app-support" aria-label="App installation and connection">
      {offline && (
        <p role="status">
          You’re offline. Local draft autosave stays available in an open
          workspace. Reconnect to sign in, load records or save to the server.
        </p>
      )}
      {update && (
        <p role="status">
          An app update is ready. After your draft is saved, close all Billing
          App tabs and windows, then reopen.
        </p>
      )}
      {error && <p role="status">{error}</p>}
      {!installed && (
        <button
          type="button"
          onClick={async () => {
            if (!prompt) {
              setHelp(!help);
              return;
            }
            const current = prompt;
            setPrompt(null);
            try {
              await current.prompt();
              await current.userChoice;
            } catch {
              setHelp(true);
            }
          }}
        >
          Install App
        </button>
      )}
      {help && !installed && (
        <p role="status">
          {ios
            ? "On iPhone or iPad, open this site in Safari, tap Share, then Add to Home Screen."
            : "In Chrome or Edge, use Install App in the address bar or browser menu when available. Installation requires HTTPS (or localhost)."}
        </p>
      )}
    </aside>
  );
}
