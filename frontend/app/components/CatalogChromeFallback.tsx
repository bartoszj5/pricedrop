import { SkeletonBox } from "./Skeleton";

export function CatalogControlsFallback() {
  return (
    <div className="flex flex-col gap-3 rounded-[28px] border border-border bg-bg-card p-4 md:flex-row md:items-center md:justify-between">
      <SkeletonBox className="h-11 w-full max-w-md rounded-full" />
      <div className="flex flex-wrap gap-2">
        <SkeletonBox className="h-10 w-24 rounded-full" />
        <SkeletonBox className="h-10 w-24 rounded-full" />
        <SkeletonBox className="h-10 w-10 rounded-full md:hidden" />
      </div>
    </div>
  );
}

export function SidebarFallback() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-3 lg:flex">
      <SkeletonBox className="h-8 w-32" />
      <SkeletonBox className="h-10 w-full rounded-xl" />
      <SkeletonBox className="h-10 w-full rounded-xl" />
      <SkeletonBox className="h-10 w-full rounded-xl" />
    </aside>
  );
}

export function PaginationFallback() {
  return (
    <div className="flex justify-center gap-2 py-2">
      <SkeletonBox className="h-10 w-10 rounded-full" />
      <SkeletonBox className="h-10 w-10 rounded-full" />
      <SkeletonBox className="h-10 w-10 rounded-full" />
    </div>
  );
}
