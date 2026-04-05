// src/app/(dashboard)/research-projects/[uuid]/documents/page.tsx
// Server Component - UUID obtained from URL

import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, FileText, FilePlus, FlaskConical, Beaker, type LucideIcon } from "lucide-react";
import { getServerAuthContext } from "@/lib/auth-server";
import { listDocuments } from "@/services/document.service";
import { researchProjectExists } from "@/services/research-project.service";
import { CreateDocumentDialog } from "./create-document-dialog";

const docTypeConfig: Record<string, { labelKey: string; color: string; icon: LucideIcon }> = {
  experiment_result: { labelKey: "documents.typeExperimentResult", color: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300", icon: Beaker },
  literature_review: { labelKey: "documents.typeLiteratureReview", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", icon: BookOpen },
  analysis: { labelKey: "documents.typeAnalysis", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300", icon: FlaskConical },
  methodology: { labelKey: "documents.typeMethodology", color: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", icon: FlaskConical },
  rdr: { labelKey: "documents.typeRdr", color: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", icon: FileText },
  results_report: { labelKey: "documents.typeResultsReport", color: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300", icon: Beaker },
  other: { labelKey: "documents.typeOther", color: "bg-secondary text-muted-foreground", icon: FileText },
};

interface PageProps {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<{ type?: string }>;
}

export default async function DocumentsPage({ params, searchParams }: PageProps) {
  const auth = await getServerAuthContext();
  if (!auth) {
    redirect("/login");
  }

  const { uuid: projectUuid } = await params;
  const { type: filter = "all" } = await searchParams;
  const t = await getTranslations();

  // Validate project exists
  const exists = await researchProjectExists(auth.companyUuid, projectUuid);
  if (!exists) {
    redirect("/research-projects");
  }

  // Get all Documents
  const { documents: allDocuments } = await listDocuments({
    companyUuid: auth.companyUuid,
    researchProjectUuid: projectUuid,
    skip: 0,
    take: 1000,
  });

  // Calculate count per type
  const typeCounts = allDocuments.reduce((acc, doc) => {
    acc[doc.type] = (acc[doc.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Filter by selected type
  const filteredDocuments = filter === "all"
    ? allDocuments
    : allDocuments.filter((doc) => doc.type === filter);

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("documents.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("documents.subtitle")}</p>
        </div>
        <CreateDocumentDialog projectUuid={projectUuid} />
      </div>

      {/* Filter Tabs */}
      <div className="mb-6 flex gap-2 overflow-x-auto border-b border-border pb-4">
        <Link href={`/research-projects/${projectUuid}/documents`}>
          <Button variant={filter === "all" ? "default" : "ghost"} size="sm">
            {t("documents.all")} ({allDocuments.length})
          </Button>
        </Link>
        {Object.entries(docTypeConfig).map(([type, config]) => {
          const count = typeCounts[type] || 0;
          if (count === 0) return null;
          return (
            <Link key={type} href={`/research-projects/${projectUuid}/documents?type=${type}`}>
              <Button variant={filter === type ? "default" : "ghost"} size="sm">
                {t(config.labelKey)} ({count})
              </Button>
            </Link>
          );
        })}
      </div>

      {/* Documents Grid */}
      {filteredDocuments.length === 0 ? (
        <Card className="flex flex-col items-center justify-center border-border bg-card p-12 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
            <FilePlus className="h-8 w-8 text-emerald-400" />
          </div>
          <h3 className="mb-2 text-lg font-medium text-foreground">{t("documents.noDocuments")}</h3>
          <p className="mb-6 max-w-sm text-sm text-muted-foreground">{t("documents.noDocumentsDesc")}</p>
          <CreateDocumentDialog projectUuid={projectUuid} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDocuments.map((doc) => (
            <Link key={doc.uuid} href={`/research-projects/${projectUuid}/documents/${doc.uuid}`}>
              <Card className="group cursor-pointer border-border bg-card p-5 transition-all hover:border-primary/50 hover:shadow-md">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                    {(() => { const Icon = docTypeConfig[doc.type]?.icon || FileText; return <Icon className="h-5 w-5 text-muted-foreground" />; })()}
                  </div>
                  <Badge className={docTypeConfig[doc.type]?.color || ""}>
                    {t(docTypeConfig[doc.type]?.labelKey || "documents.typeOther")}
                  </Badge>
                </div>
                <h3 className="mb-1 font-medium text-foreground transition-colors group-hover:text-primary">{doc.title}</h3>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>v{doc.version}</span>
                  <span>·</span>
                  <span>{t("documents.updated", { date: new Date(doc.updatedAt).toLocaleDateString() })}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
