// src/app/(dashboard)/research-projects/[uuid]/documents/[documentUuid]/page.tsx
// Server Component - UUID obtained from URL

import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, FileText, ChevronRight, FlaskConical, Beaker, type LucideIcon } from "lucide-react";
import { getServerAuthContext } from "@/lib/auth-server";
import { getDocument } from "@/services/document.service";
import { researchProjectExists } from "@/services/research-project.service";
import { DocumentActions } from "./document-actions";
import { DocumentContent } from "./document-content";

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
  params: Promise<{ uuid: string; documentUuid: string }>;
}

export default async function DocumentDetailPage({ params }: PageProps) {
  const auth = await getServerAuthContext();
  if (!auth) {
    redirect("/login");
  }

  const { uuid: projectUuid, documentUuid } = await params;
  const t = await getTranslations();

  // Validate project exists
  const exists = await researchProjectExists(auth.companyUuid, projectUuid);
  if (!exists) {
    redirect("/research-projects");
  }

  // Get Document details
  const document = await getDocument(auth.companyUuid, documentUuid);
  if (!document) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <div className="text-muted-foreground">{t("documents.documentNotFound")}</div>
        <Link href={`/research-projects/${projectUuid}/documents`} className="mt-4 text-primary hover:underline">
          {t("documents.backToDocuments")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-4 md:p-8">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm">
        <Link href={`/research-projects/${projectUuid}/documents`} className="text-muted-foreground hover:text-foreground">
          {t("nav.documents")}
        </Link>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
        <span className="text-foreground">{document.title}</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3 md:gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary md:h-12 md:w-12">
            {(() => { const Icon = docTypeConfig[document.type]?.icon || FileText; return <Icon className="h-5 w-5 text-muted-foreground md:h-6 md:w-6" />; })()}
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 md:gap-3">
              <Badge className={docTypeConfig[document.type]?.color || ""}>
                {t(docTypeConfig[document.type]?.labelKey || "documents.typeOther")}
              </Badge>
              <span className="rounded bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                v{document.version}
              </span>
            </div>
            <h1 className="text-xl font-semibold text-foreground md:text-2xl">{document.title}</h1>
            <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground md:mt-2">
              <span>{t("common.updated")} {new Date(document.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
        <DocumentActions
          documentUuid={documentUuid}
          projectUuid={projectUuid}
          documentTitle={document.title}
          documentContent={document.content || ""}
          documentType={document.type}
        />
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-6 overflow-hidden lg:flex-row">
        {/* Main Content */}
        <DocumentContent
          documentUuid={documentUuid}
          projectUuid={projectUuid}
          initialContent={document.content || ""}
          documentType={document.type}
        />

        {/* Sidebar */}
        <div className="w-full space-y-4 lg:w-64 lg:flex-shrink-0">
          {/* Source Proposal */}
          {document.experimentDesignUuid && (
            <Card className="border-border p-4">
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">{t("documents.sourceProposal")}</h3>
              <Link
                href={`/research-projects/${projectUuid}/experiment-designs/${document.experimentDesignUuid}`}
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <FileText className="h-4 w-4" />
                {t("documents.viewProposal")}
              </Link>
            </Card>
          )}

          {/* Details */}
          <Card className="border-border p-4">
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">{t("common.details")}</h3>
            <dl className="space-y-2">
              <div className="flex justify-between text-sm">
                <dt className="text-muted-foreground">{t("common.type")}</dt>
                <dd className="font-medium text-foreground">
                  {t(docTypeConfig[document.type]?.labelKey || "documents.typeOther")}
                </dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-muted-foreground">{t("common.version")}</dt>
                <dd className="font-medium text-foreground">v{document.version}</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-muted-foreground">{t("common.created")}</dt>
                <dd className="font-medium text-foreground">
                  {new Date(document.createdAt).toLocaleDateString()}
                </dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-muted-foreground">{t("common.updated")}</dt>
                <dd className="font-medium text-foreground">
                  {new Date(document.updatedAt).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </Card>

          {/* Version History */}
          <Card className="border-border p-4">
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">{t("documents.versionHistory")}</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">v{document.version}</span>
                <span className="text-xs text-muted-foreground">{t("status.current")}</span>
              </div>
              {document.version > 1 && (
                <p className="text-xs text-muted-foreground">
                  {document.version - 1} {t("documents.previousVersions")}
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
