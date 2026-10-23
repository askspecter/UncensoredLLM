export default function PageHeader({ eyebrow, title, sub, children }: { eyebrow: string; title: React.ReactNode; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl font-serif text-5xl uppercase leading-[1] md:text-6xl">{title}</h1>
        {sub && <p className="mt-4 max-w-2xl text-mute">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
