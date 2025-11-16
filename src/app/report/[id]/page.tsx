"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Button } from "@/components/Internal/Button";
import { ArrowLeft, Download, FileText, FileSpreadsheet } from "lucide-react";
import { useHistoryStore } from "@/store/history";
import { downloadFile } from "@/utils/file";
import { markdownToDoc } from "@/utils/markdown";
import type { TaskStore } from "@/store/task";

const MagicDown = dynamic(() => import("@/components/MagicDown"));

export default function ReportPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params.id as string;
  const [report, setReport] = useState<TaskStore | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadReport = async () => {
      const { load } = useHistoryStore.getState();
      const loadedReport = load(reportId);
      
      if (loadedReport) {
        setReport(loadedReport);
      }
      
      setLoading(false);
    };

    if (reportId) {
      loadReport();
    }
  }, [reportId]);

  const getReportContent = () => {
    if (!report) return "";

    return [
      report.finalReport,
      report.resources.length > 0
        ? [
            "---",
            `## Local Research Resources (${report.resources.length})`,
            `${report.resources
              .map((source, idx) => `${idx + 1}. ${source.name}`)
              .join("\n")}`,
          ].join("\n")
        : "",
      report.sources.length > 0
        ? [
            "---",
            `## Research Sources (${report.sources.length})`,
            `${report.sources
              .map(
                (source, idx) =>
                  `${idx + 1}. [${source.title || source.url}][${idx + 1}]`
              )
              .join("\n")}`,
          ].join("\n")
        : "",
    ].join("\n\n");
  };

  const handleDownloadMarkdown = () => {
    if (!report) return;
    downloadFile(
      getReportContent(),
      `${report.title}.md`,
      "text/markdown;charset=utf-8"
    );
  };

  const handleDownloadWord = () => {
    if (!report) return;
    const docHtml = markdownToDoc(getReportContent());
    downloadFile(
      docHtml,
      `${report.title}.doc`,
      "application/msword;charset=utf-8"
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading report...</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Report Not Found</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            The requested report could not be found.
          </p>
          <Button onClick={() => router.push("/")}>
            <ArrowLeft className="mr-2" />
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => router.push("/")}
            className="mb-4"
          >
            <ArrowLeft className="mr-2" />
            Back to Home
          </Button>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadMarkdown}
            >
              <FileText className="mr-2 h-4 w-4" />
              Markdown
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadWord}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Word
            </Button>
          </div>
        </div>

        {/* Report Content */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <div className="mb-6 pb-6 border-b">
            <h1 className="text-3xl font-bold mb-2">{report.title}</h1>
            {report.reportUrl && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Report URL: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{report.reportUrl}</code>
              </p>
            )}
          </div>

          {report.finalReport && (
            <MagicDown 
              value={report.finalReport} 
              onChange={() => {}} 
              hideTools={true}
            />
          )}

          {report.resources.length > 0 && (
            <div className="mt-8 prose prose-slate dark:prose-invert max-w-none">
              <hr className="my-6" />
              <h2>Local Research Resources ({report.resources.length})</h2>
              <ul>
                {report.resources.map((resource) => (
                  <li key={resource.id}>{resource.name}</li>
                ))}
              </ul>
            </div>
          )}

          {report.sources.length > 0 && (
            <div className="mt-8 prose prose-slate dark:prose-invert max-w-none">
              <hr className="my-6" />
              <h2>Research Sources ({report.sources.length})</h2>
              <ol>
                {report.sources.map((source, idx) => (
                  <li key={idx}>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.title || source.url}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
