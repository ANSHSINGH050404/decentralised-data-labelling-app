"use client";
import { Appbar } from "@/components/Appbar";

import axios from "axios";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";



const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;
const CLOUDFRONT_URL = process.env.NEXT_PUBLIC_CLOUDFRONT_URL;
// ── Types matching the backend response ──────────────────────────────────────
interface Option {
  id: number;
  image_url: string;
  submissionCount: number;
}

interface TaskDetail {
  id: number;
  title: string;
  options: Option[];
  totalSubmissions: number;
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function TaskPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = use(params);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/signin");
      return;
    }

    axios
      .get(`${BACKEND_URL}/v1/user/task?taskId=${taskId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setTask(res.data))
      .catch((err) => {
        if (err.response?.status === 403) {
          router.push("/signin");
        } else {
          setError(err.response?.data?.message ?? "Failed to load task.");
        }
      })
      .finally(() => setLoading(false));
  }, [taskId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Appbar />
        <div className="flex items-center justify-center h-[80vh]">
          <div className="flex flex-col items-center gap-4 text-gray-500">
            <svg
              className="animate-spin h-10 w-10 text-indigo-600"
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
            <span className="text-lg font-medium">Loading task…</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Appbar />
        <div className="flex items-center justify-center h-[80vh]">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">
              Task not found
            </h2>
            <p className="text-gray-500 mb-6">
              {error || "This task doesn't exist or you don't have access."}
            </p>
            <button
              onClick={() => router.push("/")}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const totalVotes = task.totalSubmissions;
  const maxVotes = Math.max(...task.options.map((o) => o.submissionCount), 1);

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50">
      <Appbar />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-10">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-indigo-600 transition-colors mb-4"
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
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to tasks
          </button>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm font-semibold text-indigo-500 uppercase tracking-widest mb-1">
                Task #{task.id}
              </p>
              <h1 className="text-3xl font-extrabold text-gray-900">
                {task.title}
              </h1>
            </div>
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2 shadow-sm">
              <svg
                className="w-5 h-5 text-indigo-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span className="text-sm font-semibold text-gray-700">
                {totalVotes} total vote{totalVotes !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>

        {/* Options grid */}
        {task.options.length === 0 ? (
          <div className="text-center text-gray-500 py-20">
            No images in this task.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {task.options.map((option) => {
              const count = option.submissionCount;
              const pct =
                totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
              const isWinner = count === maxVotes && totalVotes > 0;

              return (
                <div
                  key={option.id}
                  className={`bg-white rounded-2xl shadow-md border-2 overflow-hidden transition-all ${
                    isWinner
                      ? "border-indigo-500 shadow-indigo-200 shadow-lg"
                      : "border-gray-100"
                  }`}
                >
                  {/* Winner badge */}
                  {isWinner && (
                    <div className="flex items-center gap-1.5 bg-indigo-600 text-white text-xs font-semibold px-3 py-1.5">
                      <svg
                        className="w-3.5 h-3.5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      Top Choice
                    </div>
                  )}

                  {/* Image */}
                  <div className="relative">
                    <img
                      src={option.image_url}
                      alt={`Option ${option.id}`}
                      className="w-full h-56 object-cover"
                    />
                  </div>

                  {/* Vote info */}
                  <div className="p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-semibold text-gray-700">
                        {count} vote{count !== 1 ? "s" : ""}
                      </span>
                      <span className="text-sm font-bold text-indigo-600">
                        {pct}%
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-2.5 rounded-full transition-all duration-500 ${
                          isWinner ? "bg-indigo-600" : "bg-gray-400"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
