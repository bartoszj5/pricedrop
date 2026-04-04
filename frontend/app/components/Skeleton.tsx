export function SkeletonBox({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-bg-tertiary ${className}`}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="flex flex-col bg-bg-card rounded-xl overflow-hidden">
      <SkeletonBox className="w-full h-[140px] rounded-none" />
      <div className="flex flex-col gap-2.5 p-3.5">
        <div className="flex gap-1.5">
          <SkeletonBox className="w-14 h-[22px]" />
          <SkeletonBox className="w-14 h-[22px]" />
        </div>
        <SkeletonBox className="w-3/4 h-5" />
        <SkeletonBox className="w-1/2 h-6" />
      </div>
    </div>
  );
}

export function SkeletonTable() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonBox key={i} className="w-full h-12" />
      ))}
    </div>
  );
}
