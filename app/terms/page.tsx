import Legal from "@/components/Legal";
export const metadata = { title: "Terms | Beeper" };
export default function Page() {
  return <Legal eyebrow="Legal" title="Terms of Service" sections={[
    ["Service", "Beeper provides access to third-party and open-weight AI models through an API gateway, paid with prepaid credits."],
    ["Credits", "Credits are a prepaid grant of API access, not money, and are not redeemable for cash. Unused credits may be relisted on the marketplace."],
    ["Marketplace", "Sellers warrant they own the credit they list and that resale is permitted. Beeper may delist, hold or reverse listings that fail verification."],
    ["Accounts", "You are responsible for your API keys and sign-in methods. Lost keys cannot be recovered; rotate them from your account."],
    ["Acceptable use", "Use of the service is subject to the Acceptable Use Policy. Violations may result in suspension without refund."],
    ["Liability", "Model outputs are generated automatically and may be inaccurate or offensive. The service is provided “as is” without warranties."],
  ]} />;
}
