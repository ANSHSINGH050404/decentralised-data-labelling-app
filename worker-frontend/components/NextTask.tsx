"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Task {
  id: number;
  amount: string;
  title: string;
  options: {
    id: number;
    image_url: string;
    task_id: number;
  }[];
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export const NextTask = () => {
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/signin");
      return;
    }

    axios
      .get(`${BACKEND_URL}/v1/worker/nextTask`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .then((res) => {
        setCurrentTask(res.data.task);
      })
      .catch((err) => {
        if (err.response?.status === 403) {
          router.push("/signin");
        } else {
          setError("Failed to load task. Please try again.");
          console.error(err);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  async function handleSelect(optionId: number) {
    setSubmitting(true);
    setError("");
    try {
      const response = await axios.post(
        `${BACKEND_URL}/v1/worker/submission`,
        {
          taskId: currentTask!.id,
          selection: optionId,
        },
        {
          headers: {
            // ✅ Bearer prefix — required by workerMiddleware
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        },
      );

      const nextTask = response.data.nextTask;
      setCurrentTask(nextTask ?? null);
    } catch (e) {
      console.error(e);
      setError("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── States ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
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
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="text-lg font-medium">Loading next task…</span>
        </div>
      </div>
    );
  }

  if (!currentTask) {
    return (
      <div className="h-[80vh] flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-10 h-10 text-indigo-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            All caught up!
          </h2>
          <p className="text-gray-500 max-w-sm mx-auto">
            There are no pending tasks for you right now. Please check back in a
            moment.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {/* Task title */}
      <div className="text-center mb-10">
        <p className="text-sm font-semibold text-indigo-500 uppercase tracking-widest mb-2">
          Label this task
        </p>
        <h2 className="text-3xl font-extrabold text-gray-900">
          {currentTask.title}
        </h2>
        <p className="text-gray-500 mt-2 text-sm">
          Click the image that best matches the task description
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 max-w-md mx-auto">
          <svg
            className="w-4 h-4 shrink-0"
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

      {/* Options grid */}
      <div className="flex flex-wrap justify-center gap-6">
        {currentTask.options.map((option) => (
          <button
            key={option.id}
            onClick={() => !submitting && handleSelect(option.id)}
            disabled={submitting}
            className={`
              group relative rounded-2xl overflow-hidden border-2 transition-all duration-200
              ${
                submitting
                  ? "border-gray-200 opacity-60 cursor-not-allowed"
                  : "border-transparent hover:border-indigo-500 hover:shadow-2xl hover:shadow-indigo-200 hover:scale-[1.02] cursor-pointer"
              }
            `}
          >
            <img
              src={option.image_url}
              alt="Task option"
              className="w-80 h-56 object-cover"
            />
            {/* Hover overlay */}
            {!submitting && (
              <div className="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/10 transition-colors flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-indigo-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
            )}
            {/* Submitting spinner overlay */}
            {submitting && (
              <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                <svg
                  className="animate-spin h-8 w-8 text-indigo-600"
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
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};
