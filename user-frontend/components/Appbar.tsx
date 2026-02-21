"use client";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  WalletDisconnectButton,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { BACKEND_URL } from "@/utils";

export const Appbar = () => {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const router = useRouter();
  const { publicKey, signMessage } = useWallet();

  const signAndSend = useCallback(async () => {
    if (!publicKey || !signMessage) return;

    // Don't re-sign if already authenticated
    const existingToken = localStorage.getItem("token");
    if (existingToken) {
      setIsSignedIn(true);
      return;
    }

    try {
      const message = new TextEncoder().encode(
        "Sign this message into LabelFlow to get started"
      );

      const signature = await signMessage(message);
      if (!signature) return;

      const response = await fetch(`${BACKEND_URL}/v1/user/signin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signature: Array.from(signature),       // Uint8Array → plain array
          publicKey: publicKey.toBase58(),         // PublicKey object → string
        }),
      });

      if (!response.ok) {
        console.error("Sign-in failed:", response.statusText);
        return;
      }

      const data = await response.json();

      if (data.token) {
        localStorage.setItem("token", data.token);
        setIsSignedIn(true);
        router.push("/");
      }
    } catch (err) {
      console.error("Error during sign-in:", err);
    }
  }, [publicKey, signMessage, router]);

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (token) {
      // Already authenticated, no need to re-sign
      setIsSignedIn(true);
      return;
    }

    if (publicKey) {
      // Wallet just connected and no token yet → trigger sign-in flow
      signAndSend();
    }
  }, [publicKey, signAndSend]);

  function handleSignOut() {
    localStorage.removeItem("token");
    setIsSignedIn(false);
    router.push("/signin");
  }

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-lg bg-white/70 border-b border-gray-200/50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/25">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
              LabelFlow
            </span>
          </Link>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {isSignedIn && (
              <>
                <div className="hidden sm:flex items-center gap-2 text-sm text-green-600 font-medium bg-green-50 border border-green-200 rounded-full px-3 py-1.5">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  Signed in
                </div>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-red-500 bg-gray-100 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-xl px-4 py-2 transition-all"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  Sign Out
                </button>
              </>
            )}

            {!isSignedIn && (
              <Link
                href="/signin"
                className="flex items-center gap-2 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 rounded-xl px-5 py-2.5 shadow-md shadow-indigo-500/20 transition-all"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  />
                </svg>
                Sign In
              </Link>
            )}

            <div className="[&>button]:!rounded-xl [&>button]:!h-10 [&>button]:!text-sm [&>button]:!font-semibold [&>button]:!py-0 [&>button]:!px-4 [&>button]:!bg-gradient-to-r [&>button]:!from-violet-600 [&>button]:!to-indigo-600 [&>button:hover]:!from-violet-700 [&>button:hover]:!to-indigo-700 [&>button]:!shadow-md [&>button]:!shadow-indigo-500/20">
              {publicKey ? <WalletDisconnectButton /> : <WalletMultiButton />}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};