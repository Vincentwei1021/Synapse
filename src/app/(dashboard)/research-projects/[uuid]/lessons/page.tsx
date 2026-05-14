import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AlertTriangle, ArrowUpRight, Search, SlidersHorizontal, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getServerAuthContext } from "@/lib/auth-server";
import { researchProjectExists } from "@/services/research-project.service";
import { searchIncidentLessons } from "@/services/incident-lessons.service";

const failureTypes = [
  "code_bug",
  "data_issue",
  "compute_issue",
  "auth_issue",
  "environment",
  "methodology",
  "agent_error",
  "other",
] as const;

const statuses = ["resolved_in_run", "unresolved", "caused_failure"] as const;
const severities = ["low", "medium", "high"] as const;

interface PageProps {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<{
    q?: string;
    failureType?: string;
    phase?: string;
    status?: string;
    severity?: string;
    tags?: string;
    selected?: string;
  }>;
}

function lessonHref(projectUuid: string, current: Record<string, string | undefined>, selected: string) {
  const params = new URLSearchParams();
  Object.entries(current).forEach(([key, value]) => {
    if (value && key !== "selected") params.set(key, value);
  });
  params.set("selected", selected);
  return `/research-projects/${projectUuid}/lessons?${params.toString()}`;
}

function compactDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function LessonsPage({ params, searchParams }: PageProps) {
  const auth = await getServerAuthContext();
  if (!auth) redirect("/login");

  const { uuid: projectUuid } = await params;
  const filters = await searchParams;
  const t = await getTranslations();

  const exists = await researchProjectExists(auth.companyUuid, projectUuid);
  if (!exists) redirect("/research-projects");

  const tagList = filters.tags
    ? filters.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
    : undefined;

  const result = await searchIncidentLessons({
    companyUuid: auth.companyUuid,
    researchProjectUuid: projectUuid,
    query: filters.q ?? null,
    failureType: filters.failureType || null,
    phase: filters.phase || null,
    status: filters.status || null,
    severity: filters.severity || null,
    tags: tagList,
    limit: 50,
  });

  const selectedLesson =
    result.lessons.find((lesson) => lesson.uuid === filters.selected) ??
    result.lessons[0] ??
    null;

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("lessons.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("lessons.subtitle")}</p>
        </div>
        <Link href={`/research-projects/${projectUuid}/documents?type=execution_incident_lessons`}>
          <Button variant="outline" size="sm">
            <Wrench className="mr-2 h-4 w-4" />
            {t("lessons.openDocument")}
          </Button>
        </Link>
      </div>

      <form className="mb-6 rounded-lg border border-border bg-card p-4" action={`/research-projects/${projectUuid}/lessons`}>
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.6fr)_repeat(5,minmax(120px,1fr))_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={filters.q ?? ""} className="pl-9" placeholder={t("lessons.searchPlaceholder")} />
          </div>
          <select name="failureType" defaultValue={filters.failureType ?? ""} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">{t("lessons.anyType")}</option>
            {failureTypes.map((type) => <option key={type} value={type}>{t(`lessons.failureType.${type}`)}</option>)}
          </select>
          <select name="status" defaultValue={filters.status ?? ""} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">{t("lessons.anyStatus")}</option>
            {statuses.map((status) => <option key={status} value={status}>{t(`lessons.status.${status}`)}</option>)}
          </select>
          <select name="severity" defaultValue={filters.severity ?? ""} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">{t("lessons.anySeverity")}</option>
            {severities.map((severity) => <option key={severity} value={severity}>{t(`lessons.severity.${severity}`)}</option>)}
          </select>
          <Input name="phase" defaultValue={filters.phase ?? ""} placeholder={t("lessons.phasePlaceholder")} />
          <Input name="tags" defaultValue={filters.tags ?? ""} placeholder={t("lessons.tagsPlaceholder")} />
          <Button type="submit">
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            {t("lessons.applyFilters")}
          </Button>
        </div>
      </form>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-3">
          {result.lessons.length === 0 ? (
            <Card className="flex min-h-[280px] flex-col items-center justify-center border-border bg-card p-10 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15">
                <AlertTriangle className="h-7 w-7 text-amber-600 dark:text-amber-300" />
              </div>
              <h2 className="text-lg font-medium text-foreground">{t("lessons.emptyTitle")}</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">{t("lessons.emptyDesc")}</p>
            </Card>
          ) : (
            result.lessons.map((lesson) => {
              const active = selectedLesson?.uuid === lesson.uuid;
              return (
                <Link
                  key={lesson.uuid}
                  href={lessonHref(projectUuid, filters, lesson.uuid)}
                  className={`block rounded-lg border bg-card p-4 transition-colors hover:border-primary/60 ${active ? "border-primary/70" : "border-border"}`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{t(`lessons.status.${lesson.status}`)}</Badge>
                        <Badge variant="secondary">{t(`lessons.failureType.${lesson.failureType}`)}</Badge>
                        <span className="text-xs text-muted-foreground">{compactDate(lesson.updatedAt)}</span>
                      </div>
                      <h2 className="mt-3 text-base font-semibold text-foreground">{lesson.title}</h2>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{lesson.symptom}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{t(`lessons.severity.${lesson.severity}`)}</span>
                      {lesson.phase ? <span>{lesson.phase}</span> : null}
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>

        <aside className="rounded-lg border border-border bg-card p-5 xl:sticky xl:top-6 xl:self-start">
          {selectedLesson ? (
            <div className="space-y-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{t(`lessons.status.${selectedLesson.status}`)}</Badge>
                  <Badge variant="secondary">{t(`lessons.severity.${selectedLesson.severity}`)}</Badge>
                </div>
                <h2 className="mt-3 text-lg font-semibold text-foreground">{selectedLesson.title}</h2>
                <Link
                  href={`/research-projects/${projectUuid}/experiments?selected=${selectedLesson.experimentUuid}`}
                  className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  {selectedLesson.experimentTitle ?? selectedLesson.experimentUuid}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {[
                ["symptom", selectedLesson.symptom],
                ["rootCause", selectedLesson.rootCause],
                ["resolution", selectedLesson.resolution],
                ["prevention", selectedLesson.prevention],
                ["evidence", selectedLesson.evidenceSummary],
              ].map(([key, value]) => (
                <div key={key}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(`lessons.detail.${key}`)}</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">{value || t("lessons.notRecorded")}</p>
                </div>
              ))}

              <div className="flex flex-wrap gap-2">
                {selectedLesson.tags.length ? selectedLesson.tags.map((tag) => (
                  <Badge key={tag} variant="outline">{tag}</Badge>
                )) : (
                  <span className="text-sm text-muted-foreground">{t("lessons.noTags")}</span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("lessons.selectLesson")}</p>
          )}
        </aside>
      </div>
    </div>
  );
}
