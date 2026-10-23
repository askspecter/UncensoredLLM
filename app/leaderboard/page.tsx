import Leaderboard from "@/components/Leaderboard";
import PageHeader from "@/components/PageHeader";
import { leaderboards } from "@/lib/metrics";

export const metadata = { title: "Leaderboard | Beeper" };
export const revalidate = 60;

export default async function Page() {
  const data = await leaderboards().catch(() => null);
  return (
    <main className="mx-auto max-w-6xl px-5 pt-8 md:pt-16">
      <PageHeader eyebrow="Leaderboard · 30 days" title={<>Who’s <em className="text-ember-soft">paging</em> the most.</>}
        sub="Ranked by volume. Everyone appears under an anonymous handle. No emails or wallet addresses are shown." />
      <div className="mt-10"><Leaderboard buyers={data?.buyers ?? []} users={data?.users ?? []} /></div>
    </main>
  );
}
