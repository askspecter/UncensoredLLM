import Leaderboard from "@/components/Leaderboard";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "Leaderboard — Beeper" };

export default function Page() {
  return (
    <main className="mx-auto max-w-6xl px-5 pt-16">
      <PageHeader eyebrow="Leaderboard · 30 days" title={<>Who’s <em className="text-ember-soft">paging</em> the most.</>}
        sub="Ranked by volume. Handles are pseudonymous — pick yours in Account settings, or stay hidden.">
      </PageHeader>
      <div className="mt-10"><Leaderboard /></div>
    </main>
  );
}
