import RatePageContent from "@/components/RatePageContent";

export const metadata = { title: "Rate our service" };

export default async function RatePage(
  props: { params: Promise<{ token: string }>; searchParams: Promise<{ score?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const score = Number(searchParams.score);
  return <RatePageContent token={params.token} initialScore={score >= 1 && score <= 5 ? score : null} />;
}
