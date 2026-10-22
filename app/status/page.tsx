import PageHeader from "@/components/PageHeader";

export const metadata = { title: "Status — Beeper" };

const SERVICES = [
  ["API gateway", "99.98%"], ["Chat completions", "99.96%"], ["Image generation", "99.91%"],
  ["Order book", "100%"], ["Payments — crypto", "99.99%"], ["Payments — card", "99.93%"], ["Dashboard & auth", "99.99%"],
];

function bars(seed: number) {
  return Array.from({ length: 60 }, (_, i) => ((i * 37 + seed * 13) % 97 === 0 ? "bg-[#f5c451]" : "bg-moss"));
}

export default function Status() {
  return (
    <main className="mx-auto max-w-4xl px-5 pt-16">
      <PageHeader eyebrow="System status" title="All systems paging." />
      <div className="card mt-8 flex items-center gap-3 border-moss/40 p-5">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-moss" />
        <span>All systems operational</span>
        <span className="ml-auto font-mono text-xs text-mute">demo data</span>
      </div>
      <div className="card mt-4 divide-y divide-line">
        {SERVICES.map(([name, up], i) => (
          <div key={name} className="p-5">
            <div className="flex justify-between text-sm"><span>{name}</span><span className="font-mono text-mute">{up} · 60d</span></div>
            <div className="mt-3 flex gap-[2px]">{bars(i).map((c, j) => <span key={j} className={`h-7 flex-1 rounded-[2px] ${c}`} />)}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
