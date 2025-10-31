// ABOUTME: Renders Google sign-in trigger using NextAuth client helper.
// ABOUTME: Starts OAuth flow and disables while submitting.
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export function SignInButton() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClick = () => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    void signIn("google", { callbackUrl: "/" });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isSubmitting}
      className="mt-6 inline-flex items-center justify-center rounded-lg accent-bg px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:accent-bg-hover disabled:cursor-not-allowed disabled:opacity-70"
    >
      {isSubmitting ? "Redirecting..." : "Continue with Google"}
    </button>
  );
}
