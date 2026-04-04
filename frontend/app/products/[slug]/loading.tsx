import { SkeletonBox, SkeletonTable } from "../../components/Skeleton";

export default function Loading() {
  return (
    <main className="page-shell flex max-w-6xl flex-col gap-8">
      <SkeletonBox className="h-5 w-32" />
      <section className="section-card grid gap-6 p-6 md:p-8 xl:grid-cols-[0.9fr_1.1fr]">
        <SkeletonBox className="min-h-[280px] rounded-[28px]" />
        <div className="flex flex-col gap-4">
          <SkeletonBox className="h-5 w-24" />
          <SkeletonBox className="h-16 w-3/4" />
          <SkeletonBox className="h-10 w-2/3" />
          <SkeletonBox className="h-20 w-full" />
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <SkeletonBox key={index} className="h-28 rounded-[28px]" />
            ))}
          </div>
        </div>
      </section>
      <SkeletonBox className="h-6 w-48" />
      <SkeletonTable />
      <SkeletonBox className="h-6 w-48" />
      <SkeletonTable />
      <SkeletonBox className="h-[320px] w-full" />
    </main>
  );
}
