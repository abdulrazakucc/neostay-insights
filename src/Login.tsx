import { FormEvent, useState } from "react";
import { signIn } from "./vault";

/* Sign-in screen. The username and password are the decryption key for the data: nothing is sent
   to a server, and a wrong pair simply fails to decrypt. */
export default function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(user, password);
      setPassword("");
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="brand login-brand">
          <span className="logo" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="36" height="36"><defs><linearGradient id="lg-login" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3fd0c9" /><stop offset="1" stopColor="#8b80ea" /></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#lg-login)" /><path d="M8 20c3-8 6-8 8-2s5 6 8-4" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" /></svg>
          </span>
          <div><b>NeoStay</b><small>Insights</small></div>
        </div>
        <h1>Sign in</h1>
        <p className="login-lead">Private NICU insights prepared for Dr. Waseem Altaf.</p>
        <label>
          <span>Username</span>
          <input autoComplete="username" autoCapitalize="none" spellCheck={false} value={user} onChange={(e) => setUser(e.target.value)} required autoFocus />
        </label>
        <label>
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className="login-error" role="alert">{error}</div>}
        <button type="submit" disabled={busy || !user || !password}>{busy ? "Checking…" : "Sign in"}</button>
        <small className="login-foot">The data on this site is encrypted. Your password unlocks it in this browser only; it is never sent anywhere.</small>
      </form>
    </div>
  );
}
