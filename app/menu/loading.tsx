export default function MenuLoading() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-[#fbf8f1]">
      <div className="h-72 animate-pulse bg-[#d9d0c2]" />
      <div className="space-y-5 p-5">
        <div className="h-12 animate-pulse rounded-2xl bg-black/5" />
        {[1, 2, 3].map((item) => (
          <div key={item} className="flex gap-4 rounded-3xl bg-white p-3">
            <div className="size-32 animate-pulse rounded-2xl bg-black/5" />
            <div className="flex-1 space-y-3 py-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-black/5" />
              <div className="h-3 w-full animate-pulse rounded bg-black/5" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-black/5" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

