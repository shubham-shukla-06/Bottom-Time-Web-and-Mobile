import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}) {
  return (
    <div
      className={cn("rounded-md bg-slate-200/70 skeleton-shimmer", className)}
      {...props} />
  );
}

export { Skeleton }
