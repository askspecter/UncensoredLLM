import AdminHook from "@/components/AdminHook";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "Deploy BeeperHook | Beeper", robots: { index: false } };

export default function AdminHookPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 pt-8 md:pt-16">
      <PageHeader eyebrow="Admin" title="Deploy BeeperHook" sub="Creates the hook, the $BEEP / USDG pool and its first liquidity. You only sign with the admin wallet." />
      <AdminHook />
    </main>
  );
}
