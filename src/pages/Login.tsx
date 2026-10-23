import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui";
import { isSupabaseConfigured } from "../lib/supabase";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) return setError("Please enter your email.");
    if (!password.trim()) return setError("Please enter your password.");
    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);
    if (!result.ok) return setError(result.error ?? "Unable to sign in.");
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <img src="/logo.png" alt="LabaHub" className="login-logo" />
          <div className="login-title">LabaHub</div>
          <div className="login-subtitle">Staff sign in · Laundry booking & order tracking</div>
        </div>

        {!isSupabaseConfigured && (
          <div className="error-banner" role="alert">
            The Supabase settings are missing. Create the <code>.env</code> file described in SETUP-GUIDE.md, then restart <code>npm run dev</code>.
          </div>
        )}

        <label className="field">
          <span className="field-label">Email</span>
          <input
            className={`input${error ? " input-error" : ""}`}
            type="email"
            placeholder="you@example.com"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input
            className={`input${error ? " input-error" : ""}`}
            type="password"
            placeholder="Enter your password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? <span className="field-error">{error}</span> : null}
        </label>

        <Button type="submit" label={submitting ? "Signing in..." : "Sign In"} loading={submitting} style={{ marginTop: 12 }} />
        <p className="login-note">Staff accounts are created by the shop owner. Customers book through the mobile app.</p>
      </form>
    </div>
  );
}
