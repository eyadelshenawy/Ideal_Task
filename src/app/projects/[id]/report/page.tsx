import ProjectReportContent from "@/components/ProjectReportContent";

export default function ProjectReportPage({ params }: { params: { id: string } }) {
  return <ProjectReportContent projectId={params.id} />;
}
