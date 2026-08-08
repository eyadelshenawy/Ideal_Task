import TrackPageContent from "@/components/TrackPageContent";

export default function TrackPage({ params }: { params: { token: string } }) {
  return <TrackPageContent token={params.token} />;
}
