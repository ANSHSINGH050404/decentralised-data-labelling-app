"use client";
import { UploadImageCard, ImageItem } from "@/components/UploadImage";
import { BACKEND_URL, CLOUDFRONT_URL } from "@/utils";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

// ── Replace with your actual Solana treasury wallet address ──────────────────
const TREASURY_WALLET = "9ot6dE3PaWePG3mvEHmaNvXopTweV1D72N6Xp8T9NK3B";
const LAMPORTS_PER_IMAGE = 100_000_000; // 0.1 SOL

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

export const Upload = () => {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [txSignature, setTxSignature] = useState("");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  useEffect(() => {
    setIsSignedIn(!!localStorage.getItem("token"));
  }, []);

  // ─── Upload a single file to S3 ──────────────────────────────────────────
  async function uploadFile(id: string, file: File) {
    setImages((prev) =>
      prev.map((img) =>
        img.id === id ? { ...img, status: "uploading" } : img,
      ),
    );

    try {
      const res = await axios.get(`${BACKEND_URL}/v1/user/presignedUrl`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      const formData = new FormData();
      formData.set("bucket", res.data.fields["bucket"]);
      formData.set("X-Amz-Algorithm", res.data.fields["X-Amz-Algorithm"]);
      formData.set("X-Amz-Credential", res.data.fields["X-Amz-Credential"]);
      formData.set("X-Amz-Date", res.data.fields["X-Amz-Date"]);
      formData.set("key", res.data.fields["key"]);
      formData.set("Policy", res.data.fields["Policy"]);
      formData.set("X-Amz-Signature", res.data.fields["X-Amz-Signature"]);
      formData.set("Content-Type", file.type);
      formData.append("file", file);

      await axios.post(res.data.url, formData);

      const cloudUrl = `${CLOUDFRONT_URL}/${res.data.fields["key"]}`;

      setImages((prev) =>
        prev.map((img) =>
          img.id === id ? { ...img, status: "done", cloudUrl } : img,
        ),
      );
    } catch (err) {
      console.error("Upload failed:", err);
      setImages((prev) =>
        prev.map((img) => (img.id === id ? { ...img, status: "error" } : img)),
      );
    }
  }

  // ─── Add files (from input or drag-drop) ─────────────────────────────────
  const addFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newItems: ImageItem[] = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .map((file) => ({
        id: randomId(),
        localUrl: URL.createObjectURL(file),
        status: "pending" as const,
        fileName: file.name,
        fileSize: file.size,
      }));

    if (newItems.length === 0) return;

    setImages((prev) => [...prev, ...newItems]);

    Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .forEach((file, i) => {
        uploadFile(newItems[i].id, file);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Remove an image card ─────────────────────────────────────────────────
  function removeImage(id: string) {
    setImages((prev) => {
      const item = prev.find((img) => img.id === id);
      if (item) URL.revokeObjectURL(item.localUrl);
      return prev.filter((img) => img.id !== id);
    });
  }

  // ─── Drag & Drop ──────────────────────────────────────────────────────────
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }

  // ─── Solana payment ───────────────────────────────────────────────────────
  async function makePayment(imageCount: number): Promise<string> {
    if (!publicKey) throw new Error("Wallet not connected");

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: new PublicKey(TREASURY_WALLET),
        lamports: LAMPORTS_PER_IMAGE * imageCount,
      }),
    );

    const {
      context: { slot: minContextSlot },
      value: { blockhash, lastValidBlockHeight },
    } = await connection.getLatestBlockhashAndContext();

    const signature = await sendTransaction(transaction, connection, {
      minContextSlot,
    });

    await connection.confirmTransaction({
      blockhash,
      lastValidBlockHeight,
      signature,
    });

    setTxSignature(signature);
    return signature;
  }

  // ─── Submit task ──────────────────────────────────────────────────────────
  async function onSubmit() {
    if (!isSignedIn) {
      router.push("/signin");
      return;
    }

    const doneImages = images.filter((img) => img.status === "done");

    if (!title.trim()) {
      alert("Please add a task title");
      return;
    }
    if (doneImages.length === 0) {
      alert("Please wait for at least one image to finish uploading");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Collect payment on-chain first
      const signature = await makePayment(doneImages.length);

      // 2. Create the task, passing the confirmed tx signature for verification
      const response = await axios.post(
        `${BACKEND_URL}/v1/user/task`,
        {
          options: doneImages.map((img) => ({ imageUrl: img.cloudUrl })),
          title,
          signature,
        },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        },
      );

      router.push(`/task/${response.data.id}`);
    } catch (error) {
      console.error("Failed to create task:", error);
      alert("Failed to create task. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Derived state ────────────────────────────────────────────────────────
  const doneCount = images.filter((i) => i.status === "done").length;
  const uploadingCount = images.filter(
    (i) => i.status === "uploading" || i.status === "pending",
  ).length;
  const errorCount = images.filter((i) => i.status === "error").length;
  const allDone = images.length > 0 && uploadingCount === 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-8 py-6">
          <h2 className="text-2xl font-bold text-white">Create New Task</h2>
          <p className="text-violet-100 mt-1">
            Upload images for labeling — previews appear instantly
          </p>
        </div>

        <div className="p-8 space-y-8">
          {/* Title input */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Task Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              type="text"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all outline-none"
              placeholder="e.g. 'Identify cars in these images'"
            />
          </div>

          {/* Upload zone */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-semibold text-gray-700">
                Images
              </label>
              {images.length > 0 && (
                <div className="flex items-center gap-3 text-xs">
                  {doneCount > 0 && (
                    <span className="flex items-center gap-1 text-green-600 font-medium">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {doneCount} uploaded
                    </span>
                  )}
                  {uploadingCount > 0 && (
                    <span className="flex items-center gap-1 text-indigo-600 font-medium">
                      <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {uploadingCount} uploading
                    </span>
                  )}
                  {errorCount > 0 && (
                    <span className="flex items-center gap-1 text-red-500 font-medium">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {errorCount} failed
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Image grid */}
            {images.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
                {images.map((item) => (
                  <UploadImageCard key={item.id} item={item} onRemove={removeImage} />
                ))}
              </div>
            )}

            {/* Drop zone */}
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                relative border-2 border-dashed rounded-2xl transition-all duration-200 cursor-pointer
                flex flex-col items-center justify-center gap-3 py-10 px-6 text-center
                ${
                  isDragging
                    ? "border-indigo-500 bg-indigo-50 scale-[1.01]"
                    : "border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40"
                }
              `}
            >
              {isDragging ? (
                <>
                  <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center">
                    <svg className="w-7 h-7 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <p className="text-indigo-600 font-semibold">Drop to upload!</p>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center transition-colors">
                    <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-700">
                      {images.length === 0 ? "Click or drag & drop to upload" : "Add more images"}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      PNG, JPG, WEBP · up to 5 MB each · multiple allowed
                    </p>
                  </div>
                </>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
            </div>
          </div>

          {/* Pricing summary */}
          {images.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-500">Cost per image</span>
                <span className="font-semibold text-gray-800">0.1 SOL</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 text-sm">
                  Total ({doneCount} of {images.length} ready)
                </span>
                <span className="text-2xl font-bold text-indigo-600">
                  {(doneCount * 0.1).toFixed(1)} SOL
                </span>
              </div>
              {uploadingCount > 0 && (
                <p className="text-xs text-indigo-500 mt-2 flex items-center gap-1">
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {uploadingCount} image{uploadingCount !== 1 ? "s" : ""} still uploading…
                </p>
              )}
              {txSignature && (
                <p className="text-xs text-green-600 mt-2 truncate">
                  ✓ Payment confirmed:{" "}
                  <a
                    href={`https://solscan.io/tx/${txSignature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {txSignature.slice(0, 20)}…
                  </a>
                </p>
              )}
            </div>
          )}

          {/* Wallet warning */}
          {isSignedIn && !publicKey && (
            <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              ⚠️ Please connect your Solana wallet to pay for the task.
            </p>
          )}

          {/* Action button */}
          <button
            onClick={onSubmit}
            disabled={
              submitting ||
              !isSignedIn ||
              !publicKey ||
              (images.length > 0 && doneCount === 0 && uploadingCount === 0)
            }
            className="w-full py-4 px-6 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold rounded-xl
              hover:from-violet-700 hover:to-indigo-700
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all shadow-lg shadow-indigo-500/25
              flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing Payment…
              </>
            ) : !isSignedIn ? (
              "Sign In to Continue"
            ) : !publicKey ? (
              "Connect Wallet to Continue"
            ) : uploadingCount > 0 ? (
              `Waiting for uploads… (${doneCount}/${images.length} ready)`
            ) : allDone ? (
              `Pay & Submit Task (${(doneCount * 0.1).toFixed(1)} SOL)`
            ) : (
              "Submit Task"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};