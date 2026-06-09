export default function LeaderboardLoading() {
  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-10">
      <header className="mb-6">
        <div className="h-8 w-48 animate-pulse rounded-md bg-stone-200 sm:h-10" />
        <div className="mt-2 h-3 w-40 animate-pulse rounded-md bg-stone-100" />
        <div className="mt-4 h-9 w-72 animate-pulse rounded-full bg-stone-100" />
      </header>

      <div className="mb-6 h-64 animate-pulse rounded-3xl border border-stone-200 bg-gradient-to-b from-rose-50/40 to-amber-50/30 sm:h-80" />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card flex animate-pulse items-center gap-3 p-4">
            <div className="h-12 w-12 rounded-2xl bg-stone-200" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-1/2 rounded bg-stone-200" />
              <div className="h-3 w-3/4 rounded bg-stone-100" />
            </div>
          </div>
        ))}
      </div>

      <div className="card p-0">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex animate-pulse items-center gap-3 border-b border-stone-100 px-4 py-4 last:border-b-0">
            <div className="h-9 w-9 rounded-full bg-stone-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded bg-stone-200" />
              <div className="h-2 w-3/4 rounded bg-stone-100" />
            </div>
            <div className="h-5 w-8 rounded bg-stone-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
