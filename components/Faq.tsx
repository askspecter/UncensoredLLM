import { FAQ } from "@/lib/data";

export default function Faq() {
  return (
    <div className="divide-y divide-line border-y border-line">
      {FAQ.map((f) => (
        <details key={f.q} className="group py-5">
          <summary className="flex cursor-pointer list-none items-center justify-between text-lg">
            {f.q}
            <span className="ml-4 text-ember transition group-open:rotate-45">+</span>
          </summary>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-mute">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
