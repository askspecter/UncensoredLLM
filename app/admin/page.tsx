import AdminPayouts from "@/components/AdminPayouts";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "Admin — Beeper", robots: { index: false } };

export default function Admin() {
  return (
    <main className="mx-auto max-w-4xl px-5 pt-8 md:pt-16">
      <PageHeader eyebrow="Admin" title="Seller payouts" />
      <AdminPayouts />
    </main>
  );
}
