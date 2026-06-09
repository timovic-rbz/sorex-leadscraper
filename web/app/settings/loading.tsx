export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-10">
      <header className="mb-8">
        <div className="h-9 w-48 animate-pulse rounded-md bg-stone-200" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded-md bg-stone-100" />
      </header>
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card animate-pulse space-y-3 p-5">
            <div className="h-5 w-1/3 rounded bg-stone-200" />
            <div className="h-3 w-3/4 rounded bg-stone-100" />
            <div className="h-3 w-1/2 rounded bg-stone-100" />
            <div className="mt-3 h-10 rounded-xl bg-stone-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
