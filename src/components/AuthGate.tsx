import { useEffect, useState, type ReactNode } from "react";
import { api, session } from "../services/api";
export function AuthGate({
  children,
  onLoginIntent,
}: {
  children: ReactNode;
  onLoginIntent?: () => void;
}) {
  const [ready, setReady] = useState(false),
    [checking, setChecking] = useState(true),
    [error, setError] = useState(""),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState("");
  useEffect(() => {
    const logout = () => setReady(false);
    window.addEventListener("billing-logout", logout);
    if (session.get())
      api("/auth/me")
        .then(() => setReady(true))
        .catch((e) => setError(e.message))
        .finally(() => setChecking(false));
    else setChecking(false);
    return () => window.removeEventListener("billing-logout", logout);
  }, []);
  if (ready) return <>{children}</>;
  return (
    <main className="login-wrap">
      <div className="login-shell">
        <aside className="login-visual" aria-hidden="true">
          <div className="login-visual-badge">Billing App</div>
          <h1>Run your business with confidence.</h1>
          <p>
            Track billing, pricing, stock, and sales in one clean workspace.
          </p>
          <ul>
            <li>Fast invoicing</li>
            <li>Buyer-aware pricing</li>
            <li>Inventory visibility</li>
          </ul>
        </aside>

        <form
          className="card login-card"
          onFocus={onLoginIntent}
          onSubmit={async (e) => {
            e.preventDefault();
            setChecking(true);
            setError("");
            try {
              const result = await api<{ token: string }>(
                "/auth/login",
                "POST",
                {
                  username,
                  password,
                },
              );
              session.set(result.token);
              setPassword("");
              setReady(true);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setChecking(false);
            }
          }}
        >
          <div className="login-card-header">
            <span className="login-brand-mark">B</span>
            <div>
              <h2>Welcome back</h2>
              <p>Sign in to your workspace</p>
            </div>
          </div>

          <label>
            <span>Username</span>
            <input
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={checking}>
            {checking ? "Checking session…" : "Log in"}
          </button>
        </form>
      </div>
    </main>
  );
}
