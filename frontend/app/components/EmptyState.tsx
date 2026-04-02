import { PackageOpen } from "lucide-react";

export default function EmptyState({
  message = "Brak wyników",
}: {
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-text-muted">
      <PackageOpen className="w-12 h-12" />
      <p className="text-lg">{message}</p>
    </div>
  );
}
