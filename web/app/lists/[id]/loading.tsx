export default function ListDetailLoading() {
  return (
    <div className="mx-auto max-w-[1700px] p-4 lg:p-6">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <div className="h-9 w-24 animate-pulse rounded-full bg-stone-100" />
        <div className="h-9 w-48 animate-pulse rounded-md bg-stone-200" />
      </header>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="card animate-pulse space-y-3 p-3">
            <div className="h-7 rounded-lg bg-stone-100" />
            <div className="h-20 rounded-xl bg-stone-50" />
            <div className="h-20 rounded-xl bg-stone-50" />
          </div>
        ))}
      </div>
    </div>
  );
}
