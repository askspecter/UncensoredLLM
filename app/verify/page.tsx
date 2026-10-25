import PageHeader from "@/components/PageHeader";
import Verify from "@/components/Verify";

export const metadata = { title: "Proof of Bill | Beeper", description: "Every Beeper answer comes with a signed receipt, committed on Robinhood Chain. Verify what you paid without anyone seeing what you asked." };

const STEPS = [
  { t: "Signed receipt", d: "Each answer comes with a receipt: model, tokens, price, time and a hash of the answer. Never the words." },
  { t: "Daily Merkle root", d: "At the end of each UTC day, every receipt is folded into one fingerprint." },
  { t: "Written on chain", d: "That fingerprint is sent to Robinhood Chain. Once it's there, no bill from that day can change." },
];

export default function VerifyPage() {
  return (
    <main className="mx-auto max-w-6xl px-5 pt-8 md:pt-16">
      <PageHeader eyebrow="Proof of Bill" title={<>Prove what you paid. <span className="text-ember">Not what you asked.</span></>}
        sub="Beeper keeps no prompts and no answers, so your bill is the only record. Here is how you check it without trusting us." />
      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <div key={s.t} className="card p-5"><p className="font-mono text-xs text-ember">0{i + 1}</p><p className="mt-2 font-semibold text-bone">{s.t}</p><p className="mt-2 text-sm text-mute">{s.d}</p></div>
        ))}
      </div>
      <Verify />
    </main>
  );
}
