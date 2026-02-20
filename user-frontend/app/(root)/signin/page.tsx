"use client";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BACKEND_URL } from "@/utils";

export default function SignInPage() {
  const [publicKey, setPublicKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmed = publicKey.trim();
    if (!trimmed) {
      setError("Please enter your wallet public key.");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${BACKEND_URL}/v1/user/signin`, {
        publicKey: trimmed,
      });

      // Store raw JWT — callers add 'Bearer ' prefix when sending headers
      localStorage.setItem("token", response.data.token);

      router.push("/");
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(
          err.response?.data?.message ?? "Server error. Please try again.",
        );
      } else {
        setError("Something went wrong.");
      }
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
          <p className="text-gray-500 mt-1 text-sm">Sign in to your account</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-5">
            <h2 className="text-lg font-bold text-white">
              Enter your wallet address
            </h2>
            <p className="text-violet-100 text-sm mt-0.5">
              Paste your Solana public key to continue
            </p>
          </div>

          <form onSubmit={handleSignIn} className="p-8 space-y-5">
            {/* Public key input */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Public Key (Wallet Address)
              </label>
              <input
                type="text"
                value={publicKey}
                onChange={(e) => {
                  setPublicKey(e.target.value);
                  setError("");
                }}
                placeholder="e.g. Fk5ErPPkkyM9qXpbxsHtj45hgy…"
                className={`
                  w-full px-4 py-3 rounded-xl border font-mono text-sm transition-all outline-none
                  ${
                    error
                      ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100"
                      : "border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  }
                `}
              />
              <p className="mt-1.5 text-xs text-gray-400">
                Your Solana wallet address — 32–44 characters, base58 encoded.
              </p>

              {/* Error */}
              {error && (
                <div className="mt-3 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                  <svg
                    className="w-4 h-4 mt-0.5 shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {error}
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !publicKey.trim()}
              className="w-full py-3.5 px-6 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold rounded-xl
                hover:from-violet-700 hover:to-indigo-700
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all shadow-lg shadow-indigo-500/25
                flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
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
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Signing in…
                </>
              ) : (
                <>
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
                    />
                  </svg>
                  Sign In
                </>
              )}
            </button>
          </form>
        </div>

        {/* Dummy key helper */}
        <div className="mt-4 bg-white border border-gray-100 rounded-xl shadow-sm px-5 py-4">
          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
            🧪 Test / Dev — use this dummy public key
          </p>
          <button
            type="button"
            onClick={() =>
              setPublicKey("Fk5ErPPkkyM9qXpbxsHtj45hgynhuAe9nK6S3rS22V78")
            }
            className="w-full text-left font-mono text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-lg px-3 py-2.5 transition-colors break-all"
          >
            Fk5ErPPkkyM9qXpbxsHtj45hgynhuAe9nK6S3rS22V78
          </button>
          <p className="text-xs text-gray-400 mt-1.5">Click to auto-fill ↑</p>
        </div>
      </div>
    </main>
  );
}
