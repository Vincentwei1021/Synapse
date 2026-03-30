import { Skeleton } from "@/components/ui/skeleton";

interface DashboardRouteSkeletonProps {
  titleWidth?: string;
  showBoard?: boolean;
}

export function DashboardRouteSkeleton({
  titleWidth = "w-52",
  showBoard = false,
}: DashboardRouteSkeletonProps) {
  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <Skeleton className={`h-8 ${titleWidth}`} />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-10 w-36 rounded-xl" />
      </div>

      {showBoard ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="min-h-[calc(100vh-250px)] rounded-3xl border border-border/60 bg-card/60 p-3"
            >
              <div className="mb-4 flex items-center justify-between">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-8 rounded-full" />
              </div>
              <div className="space-y-3">
                <Skeleton className="h-28 rounded-2xl" />
                <Skeleton className="h-28 rounded-2xl" />
                <Skeleton className="h-28 rounded-2xl" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-3xl border border-border/60 bg-card/60 p-6">
            <Skeleton className="h-[520px] w-full rounded-[28px]" />
          </div>
          <div className="space-y-4">
            <div className="rounded-3xl border border-border/60 bg-card/60 p-5">
              <div className="space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
            <div className="rounded-3xl border border-border/60 bg-card/60 p-5">
              <div className="space-y-3">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
