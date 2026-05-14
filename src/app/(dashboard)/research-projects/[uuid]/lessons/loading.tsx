export default function LessonsLoading() {
  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 h-16 w-full max-w-2xl animate-pulse rounded-lg bg-muted" />
      <div className="mb-6 h-20 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-32 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  );
}
