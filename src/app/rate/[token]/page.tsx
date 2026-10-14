import RatePageContent from "@/components/RatePageContent";

export const metadata = { title: "Rate our service" };

export default function RatePage({ params, searchParams }: { params: { token: string }; searchParams: { score?: string } }) {
  const score = Number(searchParams.score);
  return <RatePageContent token={params.token} initialScore={score >= 1 && score <= 5 ? score : null} />;
}
