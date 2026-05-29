export function SkeletonText({ className = "" }: { className?: string }) {
  return <div className={`skeleton-pulse h-3 rounded-[2px] ${className}`} />;
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5 ${className}`}>
      <SkeletonText className="w-1/3" />
      <SkeletonText className="mt-4 w-2/3" />
      <SkeletonText className="mt-2 w-1/2" />
    </div>
  );
}

export function SkeletonScore({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5 ${className}`}>
      <div className="skeleton-pulse h-12 w-20 rounded-[4px]" />
      <SkeletonText className="mt-4 w-24" />
    </div>
  );
}
