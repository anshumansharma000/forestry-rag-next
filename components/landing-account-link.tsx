"use client";

import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { loadStoredSession } from "../lib/auth-client";
import { readStoredAuth } from "../lib/api";

/** Keep the public landing page accessible while offering a direct way back to work. */
export function LandingAccountLink() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    let request = 0;

    async function updateSession() {
      const currentRequest = ++request;
      try {
        const session = await loadStoredSession();
        if (active && currentRequest === request) setSignedIn(Boolean(session));
      } catch {
        if (active && currentRequest === request) setSignedIn(false);
      }
    }

    function syncStoredSession() {
      ++request;
      setSignedIn(Boolean(readStoredAuth()));
    }

    // Resolve the label from local storage immediately after hydration;
    // validate the session in the background without delaying the navbar.
    syncStoredSession();
    void updateSession();
    window.addEventListener("focus", updateSession);
    window.addEventListener("storage", syncStoredSession);
    return () => {
      active = false;
      window.removeEventListener("focus", updateSession);
      window.removeEventListener("storage", syncStoredSession);
    };
  }, []);

  const buttonClass = "primary-button !rounded-xl";

  // Both labels occupy the same grid cell so the navbar never shifts.
  const label = (
    <span className="grid">
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">Open workspace</span>
      <span className="col-start-1 row-start-1 text-center">
        {signedIn === null ? null : signedIn ? "Open workspace" : "Sign in"}
      </span>
    </span>
  );

  if (signedIn === null) {
    return (
      <span role="status" aria-label="Checking your session" className={`${buttonClass} !bg-[#e4ece6]`}>
        {label}
        <ArrowRight aria-hidden="true" className="invisible h-4 w-4" />
      </span>
    );
  }

  return (
    <a className={buttonClass} href={signedIn ? "/app" : "/login"}>
      {label}
      <ArrowRight aria-hidden="true" className="h-4 w-4" />
    </a>
  );
}
