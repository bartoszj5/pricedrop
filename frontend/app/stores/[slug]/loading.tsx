import { SkeletonBox, SkeletonTable } from "../../components/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-1 overflow-hidden">
      <main className="flex-1 flex flex-col gap-8 p-7 px-8 overflow-y-auto max-w-5xl mx-auto w-full">
        <SkeletonBox className="w-32 h-5" />
        <SkeletonBox className="w-full h-32" />
        <SkeletonBox className="w-40 h-6" />
        <SkeletonTable />
      </main>
    </div>
  );
}
