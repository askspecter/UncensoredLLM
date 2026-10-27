import AdminOrbio from "@/components/AdminOrbio";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "Orbio supply | Beeper", robots: { index: false } };

export default function AdminOrbioPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 pt-8 md:pt-16">
      <PageHeader eyebrow="Admin" title="Orbio supply" sub="Beeper serves models through Orbio when it is cheaper, paid from inference bought on Orbio's on-chain order book." />
      <AdminOrbio />
    </main>
  );
}
