"use client";

import { useEffect, useState } from "react";
import { loadStoredSession } from "../../lib/auth-client";
import { LoginScreen } from "../../components/login-screen";
import { clearStoredAuth, login, storeAuth } from "../../lib/api";

function formatError(err: unknown) {
  return err instanceof Error ? err.message : "Unable to sign in.";
}

export default function LoginRoute() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void loadStoredSession().then((session) => {
      if (active && session) window.location.replace("/app");
    }).catch(() => {
      if (active) clearStoredAuth();
    });
    return () => { active = false; };
  }, []);

  async function handleLogin(email: string, password: string) {
    setError(null);
    setLoading(true);
    try {
      storeAuth(await login(email.trim(), password));
      window.location.replace("/app");
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }

  return <LoginScreen error={error} loading={loading} onLogin={handleLogin} />;
}
