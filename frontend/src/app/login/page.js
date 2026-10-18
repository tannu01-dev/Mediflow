
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveAuth } from "@/lib/auth";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Please enter both your work email and password.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.success === false) {
        throw new Error(
          result.message ||
            "Unable to sign in. Please check your details."
        );
      }

      const payload = result.data || result;

      const token =
        result.token ||
        result.accessToken ||
        payload.token ||
        payload.accessToken;

      const user = result.user || payload.user || null;

      if (!token || !user) {
        throw new Error(
          "The server returned an incomplete sign-in response. Please check the backend configuration."
        );
      }

      saveAuth(token, user);
      router.replace("/");
    } catch (err) {
      setError(err.message || "Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mf-auth-shell">
      <aside className="mf-auth-aside">
        <Link href="/register" className="mf-brand">
          <span className="mf-brand-mark">M+</span>

          <span>
            <span className="mf-brand-name">MediFlow</span>
            <span className="mf-brand-sub">
              Hospital operations
            </span>
          </span>
        </Link>

        <div className="mf-auth-copy">
          <div className="mf-kicker">Connected healthcare</div>

          <h1>
            One team.
            <br />
            A clearer picture
            <br />
            of every patient.
          </h1>

          <p>
            Coordinate hospital teams, emergency operations and
            day-to-day workflows from one secure workspace.
          </p>

          <div className="mf-feature-stack">
            <div className="mf-feature">
              <span className="mf-feature-check">✓</span>
              Role-based access for every team
            </div>

            <div className="mf-feature">
              <span className="mf-feature-check">✓</span>
              Hospital-specific workspaces
            </div>

            <div className="mf-feature">
              <span className="mf-feature-check">✓</span>
              Secure staff account management
            </div>
          </div>
        </div>

        <div className="mf-aside-footer">
          <span>MEDIFLOW PLATFORM</span>
          <span>Care, connected.</span>
        </div>
      </aside>

      <section className="mf-auth-main">
        <div style={{ width: "100%", maxWidth: 470 }}>
          <Link href="/register" className="mf-mobile-brand">
            <span className="mf-brand-mark">M+</span>
            <span className="mf-brand-name">MediFlow</span>
          </Link>

          <form className="mf-auth-card" onSubmit={handleSubmit}>
            <div className="mf-kicker">Welcome back</div>

            <h2>Sign in to MediFlow</h2>

            <p className="mf-auth-subtitle">
              Use the account credentials provided for your hospital
              workspace.
            </p>

            {error && (
              <div className="mf-form-error" role="alert">
                {error}
              </div>
            )}

            <div className="mf-field">
              <label htmlFor="email">Work email</label>

              <input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="you@hospital.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="mf-field">
              <label htmlFor="password">Password</label>

              <div className="mf-input-wrap">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  required
                />

                <button
                  className="mf-show-password"
                  type="button"
                  onClick={() =>
                    setShowPassword((value) => !value)
                  }
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button
              className="mf-primary-btn"
              type="submit"
              disabled={loading}
            >
              {loading ? (
                "Signing you in…"
              ) : (
                <>
                  Sign in securely{" "}
                  <span aria-hidden="true">→</span>
                </>
              )}
            </button>

            <p className="mf-auth-switch">
              Setting up a new hospital?{" "}
              <Link href="/register">
                Register your hospital
              </Link>
            </p>

            <div className="mf-auth-legal">
              <span aria-hidden="true">◈</span>
              Secure access for authorized healthcare teams
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
