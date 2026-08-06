import SharePageContent from "@/components/SharePageContent";

export default function SharePage({ params }: { params: { token: string } }) {
  return <SharePageContent token={params.token} />;
}
