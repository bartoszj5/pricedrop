import { Store as StoreIcon } from "lucide-react";

interface StoreBadgeProps {
  name: string;
  className?: string;
}

export default function StoreBadge({ name, className = "" }: StoreBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-md bg-bg-tertiary text-xs font-medium text-text-muted ${className}`}
    >
      <StoreIcon className="w-3 h-3" />
      {name}
    </span>
  );
}
