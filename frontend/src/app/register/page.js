
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function RegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    hospitalName: "",
    hospitalCode: "",
    address: "",
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function update(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (form.password.length < 8) {
      return setError(
        "Choose a password with at least 8 characters."
      );
    }

    if (form.password !== form.confirmPassword) {
      return setError("The passwords do not match.");
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/api/auth/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            hospitalName: form.hospitalName.trim(),
            hospitalCode: form.hospitalCode
              .trim()
              .toUpperCase(),
            address: form.address.trim(),
            name: form.name.trim(),
            email: form.email.trim().toLowerCase(),
            password: form.password,
          }),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.success === false) {
        throw new Error(
          result.message || "Hospital registration failed."
        );
      }

      setSuccess(true);

      window.setTimeout(() => {
        router.replace("/login");
      }, 2200);
    } catch (err) {
      setError(
        err.message || "Registration failed. Please try again."
      );
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
          <div className="mf-kicker">
            A better-connected hospital
          </div>

          <h1>
            Bring your
            <br />
            hospital teams
            <br />
            into sync.
          </h1>

          <p>
            Create your hospital workspace first. Once
            registered, the hospital administrator can invite
            staff and assign access according to their
            responsibilities.
          </p>

          <div className="mf-feature-stack">
            <div className="mf-feature">
              <span className="mf-feature-check">✓</span>
              One secure workspace for your hospital
            </div>

            <div className="mf-feature">
              <span className="mf-feature-check">✓</span>
              Dedicated accounts for each staff member
            </div>

            <div className="mf-feature">
              <span className="mf-feature-check">✓</span>
              Clear roles and department assignments
            </div>
          </div>
        </div>

        <div className="mf-aside-footer">
          <span>MEDIFLOW PLATFORM</span>
          <span>Care, connected.</span>
        </div>
      </aside>

      <section className="mf-auth-main">
        <div style={{ width: "100%", maxWidth: 570 }}>
          <Link
            href="/register"
            className="mf-mobile-brand"
          >
            <span className="mf-brand-mark">M+</span>
            <span className="mf-brand-name">MediFlow</span>
          </Link>

          <form
            className="mf-auth-card"
            onSubmit={handleSubmit}
          >
            {!success ? (
              <>
                <div className="mf-kicker">Get started</div>

                <h2>Register your hospital</h2>

                <p className="mf-auth-subtitle">
                  Create the hospital workspace and its first
                  administrator account.
                </p>

                {error && (
                  <div
                    className="mf-form-error"
                    role="alert"
                  >
                    {error}
                  </div>
                )}

                <div className="mf-form-grid">
                  <div className="mf-field full">
                    <label htmlFor="hospitalName">
                      Hospital name *
                    </label>

                    <input
                      id="hospitalName"
                      name="hospitalName"
                      placeholder="e.g. Sunrise Multispeciality Hospital"
                      value={form.hospitalName}
                      onChange={update}
                      required
                      maxLength={150}
                    />
                  </div>

                  <div className="mf-field">
                    <label htmlFor="hospitalCode">
                      Hospital code *
                    </label>

                    <input
                      id="hospitalCode"
                      name="hospitalCode"
                      placeholder="e.g. SUNRISE01"
                      value={form.hospitalCode}
                      onChange={update}
                      required
                      maxLength={30}
                    />
                  </div>

                  <div className="mf-field">
                    <label htmlFor="address">
                      City / address
                    </label>

                    <input
                      id="address"
                      name="address"
                      placeholder="City, state"
                      value={form.address}
                      onChange={update}
                      maxLength={250}
                    />
                  </div>

                  <div className="mf-field full">
                    <label htmlFor="name">
                      Administrator full name *
                    </label>

                    <input
                      id="name"
                      name="name"
                      placeholder="Your full name"
                      value={form.name}
                      onChange={update}
                      required
                      maxLength={100}
                    />
                  </div>

                  <div className="mf-field full">
                    <label htmlFor="email">
                      Administrator work email *
                    </label>

                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="admin@hospital.com"
                      value={form.email}
                      onChange={update}
                      required
                    />
                  </div>

                  <div className="mf-field">
                    <label htmlFor="password">
                      Create password *
                    </label>

                    <div className="mf-input-wrap">
                      <input
                        id="password"
                        name="password"
                        type={
                          showPassword ? "text" : "password"
                        }
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        value={form.password}
                        onChange={update}
                        required
                        minLength={8}
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

                  <div className="mf-field">
                    <label htmlFor="confirmPassword">
                      Confirm password *
                    </label>

                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={
                        showPassword ? "text" : "password"
                      }
                      autoComplete="new-password"
                      placeholder="Re-enter password"
                      value={form.confirmPassword}
                      onChange={update}
                      required
                      minLength={8}
                    />
                  </div>
                </div>

                <button
                  className="mf-primary-btn"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? (
                    "Creating workspace…"
                  ) : (
                    <>
                      Create hospital workspace{" "}
                      <span aria-hidden="true">→</span>
                    </>
                  )}
                </button>

                <p className="mf-auth-switch">
                  Already registered?{" "}
                  <Link href="/login">
                    Sign in instead
                  </Link>
                </p>

                <div className="mf-auth-legal">
                  <span aria-hidden="true">◈</span>
                  Hospital details are used to create your
                  secure workspace
                </div>
              </>
            ) : (
              <div
                style={{
                  textAlign: "center",
                  padding: "28px 0 20px",
                }}
              >
                <div
                  className="mf-brand-mark"
                  style={{
                    margin: "0 auto 18px",
                    background: "var(--amber)",
                    color: "var(--ink)",
                  }}
                >
                  ✓
                </div>

                <div className="mf-kicker">
                  Workspace created
                </div>

                <h2>
                  You&apos;re ready for the next step.
                </h2>

                <p className="mf-auth-subtitle">
                  Hospital registration succeeded.
                  Redirecting you to sign in so you can open
                  your admin workspace.
                </p>

                <div
                  className="mf-form-success"
                  role="status"
                >
                  Taking you to the login page…
                </div>

                <button
                  className="mf-primary-btn"
                  type="button"
                  onClick={() => router.replace("/login")}
                >
                  Continue to sign in →
                </button>
              </div>
            )}
          </form>
        </div>
      </section>
    </main>
  );
}
