export default function ListsLoading() {
  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-10">
      <header className="mb-8">
        <div className="h-9 w-32 animate-pulse rounded-md bg-stone-200" />
        <div className="mt-2 h-4 w-48 animate-pulse rounded-md bg-stone-100" />
      </header>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card animate-pulse space-y-4 p-5">
            <div className="h-5 w-1/2 rounded bg-stone-200" />
            <div className="h-3 w-3/4 rounded bg-stone-100" />
            <div className="h-14 rounded-xl bg-stone-100" />
            <div className="grid grid-cols-3 gap-2">
              <div className="h-12 rounded-xl bg-stone-100" />
              <div className="h-12 rounded-xl bg-stone-100" />
              <div className="h-12 rounded-xl bg-stone-100" />
            </div>
            <div className="h-9 rounded-lg bg-stone-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
