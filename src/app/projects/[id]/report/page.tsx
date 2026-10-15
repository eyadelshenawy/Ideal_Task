import ProjectReportContent from "@/components/ProjectReportContent";

export default async function ProjectReportPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <ProjectReportContent projectId={params.id} />;
}
