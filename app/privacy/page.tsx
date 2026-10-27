import Legal from "@/components/Legal";
export const metadata = { title: "Privacy | Beeper" };
export default function Page() {
  return <Legal eyebrow="Legal" title="Privacy Policy" sections={[
    ["What we never store", "Prompts, completions, images and audio you send or receive. Chats are saved only in your browser. Requests are routed only to model providers that don’t collect or train on request data."],
    ["What we do store", "Billing metadata (model, token counts, cost, timestamp), your sign-in identifier from Privy (email, Google ID or wallet address), and payment records."],
    ["Sign-in", "Authentication is handled by Privy. Wallet sign-in requires no email or personal data."],
    ["Sharing", "We don’t sell data. Upstream providers receive request content only to generate a response, under zero-retention terms where available."],
    ["Web search", "Off by default. When you turn on Web in the chat, your question is sent to a search engine to find pages for the answer. Leave it off and nothing leaves Beeper except the request to the model provider."],
    ["Bill receipts", "Each answer gets a Proof of Bill receipt: model, token counts, price, time and a hash of the answer. A hash can’t be turned back into the text."],
    ["Deletion", "To delete your account, message us on X (@usebeeper) or Telegram (t.me/usebeeper). Billing records are kept only as long as legally required."],
  ]} />;
}
