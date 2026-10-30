import { notFound } from "next/navigation";
import { getAddress, isAddress } from "viem";
import LaunchCoin from "@/components/LaunchCoin";

export const metadata = { title: "Coin | Beeper Launchpad" };

export default async function CoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isAddress(token)) notFound();
  return (
    <main className="mx-auto max-w-6xl px-5 py-10 md:py-14">
      <a href="/launch" className="text-sm text-mute hover:text-bone">Launchpad</a>
      <div className="mt-4"><LaunchCoin token={getAddress(token)} /></div>
    </main>
  );
}
