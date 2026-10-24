"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AppNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [ready, setReady] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    setSigningOut(true);
    setError("");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.push("/login");
    } catch {
      setError("Unable to sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="app-header">
      <nav className="app-navigation" aria-label="Main navigation">
        <Link className="app-brand" href="/">Study Buddy<span>Learn a little. Grow every day.</span></Link>
        <div className="app-navigation-links">
          <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>Create plan</Link>
          <Link href="/dashboard" aria-current={pathname === "/dashboard" ? "page" : undefined}>Dashboard</Link>
          {ready && (signedIn ? <button className="navigation-account" onClick={signOut} disabled={signingOut}>{signingOut ? "Signing out…" : "Sign out"}</button> : <Link href="/login" aria-current={pathname === "/login" ? "page" : undefined}>Sign in</Link>)}
        </div>
      </nav>
      {error && <p className="navigation-error" role="alert">{error}</p>}
    </header>
  );
}
