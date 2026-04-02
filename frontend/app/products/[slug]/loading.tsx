import { SkeletonBox, SkeletonTable } from "../../components/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-1 overflow-hidden">
      <main className="flex-1 flex flex-col gap-8 p-7 px-8 overflow-y-auto max-w-5xl mx-auto w-full">
        <SkeletonBox className="w-32 h-5" />
        <div className="flex gap-8">
          <SkeletonBox className="w-[360px] h-[200px] shrink-0" />
          <div className="flex flex-col gap-3 flex-1">
            <SkeletonBox className="w-3/4 h-9" />
            <SkeletonBox className="w-1/3 h-7" />
            <SkeletonBox className="w-full h-16" />
            <SkeletonBox className="w-full h-16" />
          </div>
        </div>
        <SkeletonBox className="w-40 h-6" />
        <SkeletonTable />
        <SkeletonBox className="w-40 h-6" />
        <SkeletonBox className="w-full h-[320px]" />
      </main>
    </div>
  );
}
