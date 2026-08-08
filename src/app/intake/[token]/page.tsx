import IntakePageContent from "@/components/IntakePageContent";

export default function IntakePage({ params }: { params: { token: string } }) {
  return <IntakePageContent token={params.token} />;
}
