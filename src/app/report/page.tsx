"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ReportView from "@/components/Research/ReportView";

function LocalReport() {
  return <ReportView reportId={useSearchParams().get("id") || ""} />;
}

export default function ReportPage() {
  return <Suspense fallback={null}><LocalReport /></Suspense>;
}
