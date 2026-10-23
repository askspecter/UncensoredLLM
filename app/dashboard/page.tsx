import Account from "@/components/Account";

export const metadata = { title: "Account | Beeper" };

export default function Dashboard() {
  return (
    <main className="mx-auto max-w-6xl px-5 pt-8 md:pt-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Account</p>
          <h1 className="mt-2 text-4xl leading-[1.05] font-semibold tracking-[-0.035em] text-bone md:text-5xl">Your key, your numbers.</h1>
        </div>
        <a href="/#buy" className="btn btn-primary text-sm">Top up</a>
      </div>
      <Account />
    </main>
  );
}
