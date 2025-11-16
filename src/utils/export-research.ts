// Export research data utility functions
import type { TaskStore } from "@/store/task";
import { downloadFile } from "@/utils/file";

export interface ResearchExportData {
  metadata: {
    exportDate: string;
    reportId: string;
    reportTitle: string;
    totalTasks: number;
    totalSources: number;
    totalResources: number;
  };
  research: {
    question: string;
    query: string;
    reportPlan: string;
    requirement: string;
    feedback: string;
    suggestion: string;
  };
  tasks: Array<{
    query: string;
    researchGoal: string;
    state: string;
    learning: string;
    sources: Array<{
      title?: string;
      url: string;
      content?: string;
    }>;
    images: Array<{
      url: string;
      description?: string;
    }>;
  }>;
  resources: Array<{
    id: string;
    name: string;
    type: string;
    size: number;
    status: string;
  }>;
  finalReport: {
    title: string;
    content: string;
    knowledgeGraph: string;
  };
  sources: Array<{
    title?: string;
    url: string;
    formattedCitation?: string;
  }>;
  images: Array<{
    url: string;
    description?: string;
  }>;
}

/**
 * Export research data as JSON
 */
export function exportResearchDataAsJSON(taskStore: TaskStore): void {
  const exportData: ResearchExportData = {
    metadata: {
      exportDate: new Date().toISOString(),
      reportId: taskStore.id,
      reportTitle: taskStore.title,
      totalTasks: taskStore.tasks.length,
      totalSources: taskStore.sources.length,
      totalResources: taskStore.resources.length,
    },
    research: {
      question: taskStore.question,
      query: taskStore.query,
      reportPlan: taskStore.reportPlan,
      requirement: taskStore.requirement,
      feedback: taskStore.feedback,
      suggestion: taskStore.suggestion,
    },
    tasks: taskStore.tasks.map((task) => ({
      query: task.query,
      researchGoal: task.researchGoal,
      state: task.state,
      learning: task.learning,
      sources: task.sources.map((source) => ({
        title: source.title,
        url: source.url,
        content: source.content,
      })),
      images: task.images.map((image) => ({
        url: image.url,
        description: image.description,
      })),
    })),
    resources: taskStore.resources.map((resource) => ({
      id: resource.id,
      name: resource.name,
      type: resource.type,
      size: resource.size,
      status: resource.status,
    })),
    finalReport: {
      title: taskStore.title,
      content: taskStore.finalReport,
      knowledgeGraph: taskStore.knowledgeGraph,
    },
    sources: taskStore.sources.map((source) => ({
      title: source.title,
      url: source.url,
      formattedCitation: source.formattedCitation,
    })),
    images: taskStore.images.map((image) => ({
      url: image.url,
      description: image.description,
    })),
  };

  const filename = taskStore.title
    ? `${taskStore.title}_research_data.json`
    : `research_data_${Date.now()}.json`;

  downloadFile(
    JSON.stringify(exportData, null, 2),
    filename,
    "application/json;charset=utf-8"
  );
}

/**
 * Export research data as CSV
 */
export function exportResearchDataAsCSV(taskStore: TaskStore): void {
  // Create CSV for tasks
  const tasksCSV = [
    // Header
    ["Query", "Research Goal", "State", "Learning Preview", "Sources Count", "Images Count"].join(","),
    // Data rows
    ...taskStore.tasks.map((task) => [
      `"${task.query.replace(/"/g, '""')}"`,
      `"${task.researchGoal.replace(/"/g, '""')}"`,
      task.state,
      `"${task.learning.substring(0, 100).replace(/"/g, '""')}..."`,
      task.sources.length,
      task.images.length,
    ].join(",")),
  ].join("\n");

  // Create CSV for sources
  const sourcesCSV = [
    // Header
    ["Title", "URL", "Has Citation"].join(","),
    // Data rows
    ...taskStore.sources.map((source) => [
      `"${(source.title || "Untitled").replace(/"/g, '""')}"`,
      `"${source.url}"`,
      source.formattedCitation ? "Yes" : "No",
    ].join(",")),
  ].join("\n");

  // Create combined CSV file with metadata
  const combinedCSV = [
    "=== RESEARCH METADATA ===",
    `Report ID,${taskStore.id}`,
    `Report Title,"${taskStore.title.replace(/"/g, '""')}"`,
    `Export Date,${new Date().toISOString()}`,
    `Total Tasks,${taskStore.tasks.length}`,
    `Total Sources,${taskStore.sources.length}`,
    `Total Resources,${taskStore.resources.length}`,
    "",
    "=== RESEARCH TASKS ===",
    tasksCSV,
    "",
    "=== SOURCES ===",
    sourcesCSV,
  ].join("\n");

  const filename = taskStore.title
    ? `${taskStore.title}_research_data.csv`
    : `research_data_${Date.now()}.csv`;

  downloadFile(combinedCSV, filename, "text/csv;charset=utf-8");
}

/**
 * Export complete research package (all data + report)
 */
export function exportCompleteResearchPackage(taskStore: TaskStore): void {
  const packageData = {
    version: "1.0",
    exportDate: new Date().toISOString(),
    research: {
      id: taskStore.id,
      title: taskStore.title,
      question: taskStore.question,
      query: taskStore.query,
      reportPlan: taskStore.reportPlan,
      requirement: taskStore.requirement,
      feedback: taskStore.feedback,
      suggestion: taskStore.suggestion,
    },
    tasks: taskStore.tasks,
    resources: taskStore.resources,
    finalReport: taskStore.finalReport,
    sources: taskStore.sources,
    images: taskStore.images,
    knowledgeGraph: taskStore.knowledgeGraph,
  };

  const filename = taskStore.title
    ? `${taskStore.title}_complete_package.json`
    : `research_package_${Date.now()}.json`;

  downloadFile(
    JSON.stringify(packageData, null, 2),
    filename,
    "application/json;charset=utf-8"
  );
}
