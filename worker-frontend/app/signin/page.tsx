"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";


const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export default function SignInPage() {
  const { publicKey, signMessage } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  // Automatically trigger sign-in when wallet is connected
  useEffect(() => {
    if (publicKey && signMessage) {
      handleSignIn();
    }
  }, [publicKey, signMessage]);

  async function handleSignIn() {
    if (!publicKey || !signMessage) return;

    setError("");
    setLoading(true);

    try {
      const message = new TextEncoder().encode(
        "Sign this message into LabelFlow to get started",
      );

      const signature = await signMessage(message);

      const response = await axios.post(`${BACKEND_URL}/v1/worker/signin`, {
        publicKey: publicKey.toBase58(),
        signature: {
          data: Array.from(signature),
        },
      });

      localStorage.setItem("token", response.data.token);
      router.push("/");
    } catch (err: any) {
      console.error("Sign-in error:", err);
      setError(
        err.response?.data?.message || "Failed to sign in. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/30 mb-4">
            <svg
              className="w-8 h-8 text-white"
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
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            LabelFlow
          </h1>
          <p className="text-gray-500 mt-1 text-sm text-center">
            Sign in as a <strong>Worker</strong> to earn SOL
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden text-center p-10">
          <h2 className="text-xl font-bold text-gray-800 mb-6">
            Connect your wallet to start working
          </h2>

          <div className="flex justify-center mb-8 scale-110">
            <WalletMultiButton className="!bg-indigo-600 hover:!bg-indigo-700 !rounded-xl !h-12" />
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 text-indigo-600 font-medium animate-pulse mb-4">
              <svg
                className="animate-spin h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Waiting for signature...
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
              {error}
            </div>
          )}

          <p className="text-xs text-gray-400">
            Proven ownership via signature is required for security. No SOL will
            be spent for signing in.
          </p>
        </div>
      </div>
    </main>
  );
}
