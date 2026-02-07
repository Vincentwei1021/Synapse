// src/app/(dashboard)/projects/[uuid]/documents/page.tsx
// Server Component - UUID 从 URL 获取

import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getServerAuthContext } from "@/lib/auth-server";
import { listDocuments } from "@/services/document.service";
import { projectExists } from "@/services/project.service";
import { CreateDocumentDialog } from "./create-document-dialog";

const docTypeConfig: Record<string, { label: string; color: string; icon: string }> = {
  prd: { label: "PRD", color: "bg-[#E3F2FD] text-[#1976D2]", icon: "📋" },
  spec: { label: "Spec", color: "bg-[#E8F5E9] text-[#5A9E6F]", icon: "📝" },
  design: { label: "Design", color: "bg-[#F3E5F5] text-[#7B1FA2]", icon: "🎨" },
  note: { label: "Note", color: "bg-[#FFF3E0] text-[#E65100]", icon: "📒" },
  other: { label: "Other", color: "bg-[#F5F5F5] text-[#6B6B6B]", icon: "📄" },
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

  // 验证项目存在
  const exists = await projectExists(auth.companyUuid, projectUuid);
  if (!exists) {
    redirect("/projects");
  }

  // 获取所有 Documents
  const { documents: allDocuments } = await listDocuments({
    companyUuid: auth.companyUuid,
    projectUuid,
    skip: 0,
    take: 1000,
  });

  // 计算各类型数量
  const typeCounts = allDocuments.reduce((acc, doc) => {
    acc[doc.type] = (acc[doc.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // 根据 filter 过滤
  const filteredDocuments = filter === "all"
    ? allDocuments
    : allDocuments.filter((doc) => doc.type === filter);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#2C2C2C]">{t("documents.title")}</h1>
          <p className="mt-1 text-sm text-[#6B6B6B]">{t("documents.subtitle")}</p>
        </div>
        <CreateDocumentDialog projectUuid={projectUuid} />
      </div>

      {/* Filter Tabs */}
      <div className="mb-6 flex gap-2 border-b border-border pb-4">
        <Link href={`/projects/${projectUuid}/documents`}>
          <Button variant={filter === "all" ? "default" : "ghost"} size="sm">
            {t("documents.all")} ({allDocuments.length})
          </Button>
        </Link>
        {Object.entries(docTypeConfig).map(([type, config]) => {
          const count = typeCounts[type] || 0;
          if (count === 0) return null;
          return (
            <Link key={type} href={`/projects/${projectUuid}/documents?type=${type}`}>
              <Button variant={filter === type ? "default" : "ghost"} size="sm">
                {config.label} ({count})
              </Button>
            </Link>
          );
        })}
      </div>

      {/* Documents Grid */}
      {filteredDocuments.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center border-[#E5E0D8]">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#E8F5E9]">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 text-[#5A9E6F]">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-medium text-[#2C2C2C]">{t("documents.noDocuments")}</h3>
          <p className="mb-6 max-w-sm text-sm text-[#6B6B6B]">{t("documents.noDocumentsDesc")}</p>
          <CreateDocumentDialog projectUuid={projectUuid} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDocuments.map((doc) => (
            <Link key={doc.uuid} href={`/projects/${projectUuid}/documents/${doc.uuid}`}>
              <Card className="group cursor-pointer border-[#E5E0D8] p-5 transition-all hover:border-[#C67A52] hover:shadow-md">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F5F2EC] text-xl">
                    {docTypeConfig[doc.type]?.icon || "📄"}
                  </div>
                  <Badge className={docTypeConfig[doc.type]?.color || ""}>
                    {docTypeConfig[doc.type]?.label || doc.type}
                  </Badge>
                </div>
                <h3 className="mb-1 font-medium text-[#2C2C2C] group-hover:text-[#C67A52]">{doc.title}</h3>
                <div className="flex items-center gap-3 text-xs text-[#9A9A9A]">
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
