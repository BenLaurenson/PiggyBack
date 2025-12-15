"use client";

function TransactionSkeleton() {
  return (
    <div
      className="p-4 rounded-2xl border-2 bg-white animate-pulse"
      style={{ borderColor: 'var(--sand-7)' }}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 flex-1">
          {/* Icon skeleton */}
          <div
            className="w-11 h-11 rounded-xl"
            style={{ backgroundColor: 'var(--sand-4)' }}
          />

          {/* Text skeleton */}
          <div className="flex-1 space-y-2">
            <div
              className="h-4 rounded w-32"
              style={{ backgroundColor: 'var(--sand-4)' }}
            />
            <div
              className="h-3 rounded w-24"
              style={{ backgroundColor: 'var(--sand-3)' }}
            />
          </div>
        </div>

        {/* Amount skeleton */}
        <div
          className="h-6 rounded w-20"
          style={{ backgroundColor: 'var(--sand-4)' }}
        />
      </div>

      {/* Badges skeleton */}
      <div className="flex gap-2">
        <div
          className="h-5 rounded-lg w-16"
          style={{ backgroundColor: 'var(--sand-3)' }}
        />
        <div
          className="h-5 rounded-lg w-12"
          style={{ backgroundColor: 'var(--sand-3)' }}
        />
      </div>
    </div>
  );
}

export function TransactionSkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <TransactionSkeleton key={i} />
      ))}
    </div>
  );
}
