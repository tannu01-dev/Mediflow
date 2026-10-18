
const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("mediflow_token") || "";
}

export function getStoredUser() {
  if (typeof window === "undefined") return null;

  try {
    const user = localStorage.getItem("mediflow_user");
    return user ? JSON.parse(user) : null;
  } catch {
    return null;
  }
}

export function saveAuth(token, user) {
  if (typeof window === "undefined") return;

  localStorage.setItem("mediflow_token", token);

  if (user) {
    localStorage.setItem("mediflow_user", JSON.stringify(user));
  }
}

export function logout() {
  if (typeof window === "undefined") return;

  localStorage.removeItem("mediflow_token");
  localStorage.removeItem("mediflow_user");
  window.location.replace("/login");
}

export async function apiRequest(path, options = {}) {
  const token = getToken();

  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });

  const result = await response.json().catch(() => ({}));

  if (response.status === 401 && typeof window !== "undefined") {
    logout();
  }

  if (!response.ok) {
    throw new Error(
      result.message || result.error || `Request failed (${response.status})`
    );
  }

  return result;
}

export { API_URL };
