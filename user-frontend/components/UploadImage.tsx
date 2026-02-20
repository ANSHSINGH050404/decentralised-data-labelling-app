"use client";

export type ImageStatus = "pending" | "uploading" | "done" | "error";

export interface ImageItem {
  id: string;
  localUrl: string; // blob: URL for instant local preview
  cloudUrl?: string; // CloudFront URL after successful upload
  status: ImageStatus;
  fileName: string;
  fileSize: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadImageCard({
  item,
  onRemove,
}: {
  item: ImageItem;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="upload-card group relative rounded-2xl overflow-hidden bg-gray-100 shadow-md border border-gray-200">
      {/* Image preview */}
      <img
        src={item.localUrl}
        alt={item.fileName}
        className="w-full h-40 object-cover"
      />

      {/* Status overlay */}
      {item.status !== "done" && (
        <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-2">
          {item.status === "uploading" || item.status === "pending" ? (
            <>
              <svg
                className="animate-spin h-8 w-8 text-white"
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
              <span className="text-white text-xs font-medium">
                {item.status === "pending" ? "Queued" : "Uploading…"}
              </span>
            </>
          ) : (
            /* error */
            <>
              <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center">
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <span className="text-white text-xs font-medium">Failed</span>
            </>
          )}
        </div>
      )}

      {/* Done badge */}
      {item.status === "done" && (
        <div className="absolute top-2 left-2">
          <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
            <svg
              className="w-4 h-4 text-white"
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

      {/* Remove button — visible on hover */}
      <button
        onClick={() => onRemove(item.id)}
        className="absolute top-2 right-2 w-7 h-7 bg-black/60 hover:bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center"
        title="Remove image"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      {/* Footer info */}
      <div className="px-3 py-2 bg-white border-t border-gray-100">
        <p className="text-xs font-medium text-gray-700 truncate">
          {item.fileName}
        </p>
        <p className="text-xs text-gray-400">{formatBytes(item.fileSize)}</p>
      </div>
    </div>
  );
}
