import { SkeletonCard } from "./components/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar skeleton */}
      <aside className="w-[260px] shrink-0 bg-bg-secondary" />
      <div className="w-px bg-border" />
      <main className="flex-1 flex flex-col gap-6 p-7 px-8">
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </main>
    </div>
  );
}
