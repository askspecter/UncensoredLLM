import AdminPayouts from "@/components/AdminPayouts";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "Admin | Beeper", robots: { index: false } };

export default function Admin() {
  return (
    <main className="mx-auto max-w-4xl px-5 pt-8 md:pt-16">
      <PageHeader eyebrow="Admin" title="Seller payouts">
        <div className="flex gap-2">
          <a href="/admin/orbio" className="btn btn-ghost text-sm">Orbio supply</a>
          <a href="/admin/hook" className="btn btn-ghost text-sm">Deploy BeeperHook</a>
          <a href="/admin/launch" className="btn btn-ghost text-sm">Deploy launchpad</a>
        </div>
      </PageHeader>
      <AdminPayouts />
    </main>
  );
}
