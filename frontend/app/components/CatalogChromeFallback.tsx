import { SkeletonBox } from "./Skeleton";

export function CatalogControlsFallback() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SkeletonBox className="h-5 w-40 rounded-md" />
      <div className="flex gap-2">
        <SkeletonBox className="h-10 w-36 rounded-full" />
        <SkeletonBox className="h-10 w-24 rounded-full" />
      </div>
    </div>
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
