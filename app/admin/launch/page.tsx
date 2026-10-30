import AdminLaunch from "@/components/AdminLaunch";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "Deploy launchpad | Beeper", robots: { index: false } };

export default function AdminLaunchPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 pt-8 md:pt-16">
      <PageHeader eyebrow="Admin" title="Deploy the launchpad" sub="Creates the CreditRouter and BeeperLauncher contracts. You only sign with the admin wallet." />
      <AdminLaunch />
    </main>
  );
}
