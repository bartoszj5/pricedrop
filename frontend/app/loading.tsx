import { SkeletonCard } from "./components/Skeleton";

export default function Loading() {
  return (
    <main className="page-shell flex flex-col gap-6">
      <div className="section-card h-[260px]" />
      <div className="section-card h-[180px]" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
      </div>
    </main>
  );
}
