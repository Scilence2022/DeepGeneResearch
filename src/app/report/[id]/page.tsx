import ReportView from "@/components/Research/ReportView";

export default async function LegacyReportPage({ params }: { params: Promise<{ id: string }> }) {
  return <ReportView reportId={(await params).id} />;
}
