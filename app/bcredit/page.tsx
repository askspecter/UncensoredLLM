import BCredit from "@/components/BCredit";
import PageHeader from "@/components/PageHeader";
import { HOLDER_SHARE, MIN_BEEP } from "@/lib/bcredit";

export const metadata = { title: "bCREDIT | Beeper" };

const STEPS = [
  ["Hold $BEEP", `Keep at least ${MIN_BEEP.toLocaleString("en-US")} $BEEP in a wallet you control on Robinhood Chain.`],
  ["Link your wallet", "Sign one message to prove the wallet is yours. No transaction, no gas, nothing is moved."],
  ["Earn every day", `Each day, ${Math.round(HOLDER_SHARE * 100)}% of Beeper's revenue is split across linked holders by how much $BEEP they hold.`],
  ["Activate", "Turn bCREDIT into API balance 1:1 and spend it on chat, images or the API."],
];

export default function Page() {
  return (
    <main className="mx-auto max-w-6xl px-5 pt-8 md:pt-16">
      <PageHeader eyebrow="Holder rewards" title={<>Hold $BEEP. <em>Earn bCREDIT.</em></>}
        sub="bCREDIT is Beeper's holder reward: a daily share of real revenue, paid as AI credit to everyone who holds $BEEP." />
      <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(([t, d], i) => (
          <li key={t} className="card p-5">
            <span className="font-serif text-3xl text-ember">{i + 1}</span>
            <p className="mt-2 font-semibold">{t}</p>
            <p className="mt-1 text-sm text-mute">{d}</p>
          </li>
        ))}
      </ol>
      <div className="mt-6"><BCredit /></div>
    </main>
  );
}
