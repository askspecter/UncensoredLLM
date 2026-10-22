import Legal from "@/components/Legal";
export const metadata = { title: "Acceptable Use — Beeper" };
export default function Page() {
  return <Legal eyebrow="Legal" title="Acceptable Use Policy" sections={[
    ["Uncensored ≠ lawless", "Beeper adds no extra filters to model output. You remain fully responsible for complying with the laws that apply to you."],
    ["Strictly prohibited", "Child sexual abuse material or any sexual content involving minors; non-consensual intimate imagery of real people; content facilitating terrorism, weapons of mass destruction, or credible threats of violence."],
    ["Fraud & abuse", "Using the service for fraud, malware, spam, or attacks on systems you don’t own or aren’t authorised to test."],
    ["Enforcement", "We act on reports and on billing-level abuse signals. Violating accounts are terminated and remaining credits forfeited; we cooperate with lawful requests."],
  ]} />;
}
