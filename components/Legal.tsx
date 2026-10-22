import PageHeader from "./PageHeader";

export default function Legal({ eyebrow, title, sections }: { eyebrow: string; title: string; sections: [string, string][] }) {
  return (
    <main className="mx-auto max-w-3xl px-5 pt-16">
      <PageHeader eyebrow={eyebrow} title={title} />
      <p className="mt-4 font-mono text-xs text-mute">Template — have this reviewed by a lawyer before launch.</p>
      <div className="mt-10 space-y-8">
        {sections.map(([h, body], i) => (
          <section key={h}>
            <h2 className="text-xl">{i + 1}. {h}</h2>
            <p className="mt-2 leading-relaxed text-mute">{body}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
