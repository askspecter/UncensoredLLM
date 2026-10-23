import Legal from "@/components/Legal";
export const metadata = { title: "Privacy | Beeper" };
export default function Page() {
  return <Legal eyebrow="Legal" title="Privacy Policy" sections={[
    ["What we never store", "Prompts, completions, images and audio you send or receive. Inference runs on zero-retention endpoints."],
    ["What we do store", "Billing metadata (model, token counts, cost, timestamp), your sign-in identifier from Privy (email, Google ID or wallet address), and payment records."],
    ["Sign-in", "Authentication is handled by Privy. Wallet sign-in requires no email or personal data."],
    ["Sharing", "We don’t sell data. Upstream providers receive request content only to generate a response, under zero-retention terms where available."],
    ["Deletion", "Delete your account from Account settings; billing records are kept only as long as legally required."],
  ]} />;
}
