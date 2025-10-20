// ABOUTME: Provides signed-in users a way to end their session.
// ABOUTME: Calls NextAuth signOut with return navigation to landing page.
"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

export function SignOutButton() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClick = () => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    void signOut({ callbackUrl: "/auth/sign-in" });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isSubmitting}
      className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {isSubmitting ? "Signing out..." : "Sign out"}
    </button>
  );
}
