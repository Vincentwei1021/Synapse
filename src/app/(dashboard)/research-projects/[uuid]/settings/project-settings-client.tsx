"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Experiment {
  uuid: string;
  title: string;
  status: string;
}

interface ResearchQuestion {
  uuid: string;
  title: string;
  status: string;
}

interface Project {
  uuid: string;
  name: string;
  description: string | null;
  datasets: unknown;
  evaluationMethods: unknown;
  computePoolUuid: string | null;
  repoUrl: string | null;
  githubUsername: string | null;
  githubConfigured: boolean;
  experiments: Experiment[];
  researchQuestions: ResearchQuestion[];
}

interface Pool {
  uuid: string;
  name: string;
}

interface ProjectSettingsClientProps {
  project: Project;
  pools: Pool[];
}

function statusVariant(status: string): "default" | "secondary" | "success" | "outline" {
  switch (status) {
    case "completed":
    case "done":
      return "success";
    case "in_progress":
      return "default";
    case "draft":
      return "secondary";
    default:
      return "outline";
  }
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ProjectSettingsClient({ project, pools }: ProjectSettingsClientProps) {
  const t = useTranslations("projectSettings");
  const tc = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Form state for editing project info
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || "");
  const [datasets, setDatasets] = useState(
    Array.isArray(project.datasets) ? (project.datasets as string[]).join("\n") : ""
  );
  const [evaluationMethods, setEvaluationMethods] = useState(
    Array.isArray(project.evaluationMethods) ? (project.evaluationMethods as string[]).join("\n") : ""
  );
  const [computePoolUuid, setComputePoolUuid] = useState(project.computePoolUuid || "none");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // GitHub config state
  const [repoUrl, setRepoUrl] = useState(project.repoUrl || "");
  const [githubUsername, setGithubUsername] = useState(project.githubUsername || "");
  const [githubToken, setGithubToken] = useState("");
  const [savingGithub, setSavingGithub] = useState(false);
  const [githubMessage, setGithubMessage] = useState<string | null>(null);

  // Delete experiment state
  const [deleteExperimentTarget, setDeleteExperimentTarget] = useState<Experiment | null>(null);
  const [deletingExperiment, setDeletingExperiment] = useState(false);

  // Delete question state
  const [deleteQuestionTarget, setDeleteQuestionTarget] = useState<ResearchQuestion | null>(null);
  const [deletingQuestion, setDeletingQuestion] = useState(false);

  // Delete project state
  const [showDeleteProject, setShowDeleteProject] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deletingProject, setDeletingProject] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaveMessage(null);
    try {
      const response = await fetch(`/api/research-projects/${project.uuid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          datasets: datasets
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          evaluationMethods: evaluationMethods
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          computePoolUuid: computePoolUuid === "none" ? null : computePoolUuid,
        }),
      });
      if (response.ok) {
        setSaveMessage(t("saved"));
        startTransition(() => {
          router.refresh();
        });
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setSaveMessage(t("saveFailed"));
      }
    } catch {
      setSaveMessage(t("saveFailed"));
    }
    setSaving(false);
  }

  async function handleSaveGithub() {
    setSavingGithub(true);
    setGithubMessage(null);
    try {
      const body: Record<string, unknown> = {
        repoUrl: repoUrl.trim() || null,
        githubUsername: githubUsername.trim() || null,
      };
      // Only send token if user typed a new value
      if (githubToken.trim()) {
        body.githubToken = githubToken.trim();
      }
      const response = await fetch(`/api/research-projects/${project.uuid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setGithubMessage(t("saved"));
        setGithubToken("");
        startTransition(() => {
          router.refresh();
        });
        setTimeout(() => setGithubMessage(null), 3000);
      } else {
        setGithubMessage(t("saveFailed"));
      }
    } catch {
      setGithubMessage(t("saveFailed"));
    }
    setSavingGithub(false);
  }

  async function handleDeleteExperiment() {
    if (!deleteExperimentTarget) return;
    setDeletingExperiment(true);
    try {
      const response = await fetch(`/api/experiments/${deleteExperimentTarget.uuid}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setDeleteExperimentTarget(null);
        startTransition(() => {
          router.refresh();
        });
      }
    } catch {
      // Silent fail — user can retry
    }
    setDeletingExperiment(false);
  }

  async function handleDeleteQuestion() {
    if (!deleteQuestionTarget) return;
    setDeletingQuestion(true);
    try {
      const response = await fetch(`/api/research-questions/${deleteQuestionTarget.uuid}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setDeleteQuestionTarget(null);
        startTransition(() => {
          router.refresh();
        });
      }
    } catch {
      // Silent fail — user can retry
    }
    setDeletingQuestion(false);
  }

  async function handleDeleteProject() {
    setDeletingProject(true);
    try {
      const response = await fetch(`/api/research-projects/${project.uuid}`, {
        method: "DELETE",
      });
      if (response.ok) {
        router.push("/research-projects");
      }
    } catch {
      // Silent fail — user can retry
    }
    setDeletingProject(false);
  }

  return (
    <>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{project.name}</p>
      </div>

      {/* Section 1: Edit Project Info */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-foreground">{t("editInfo")}</h2>
        <div className="mt-5 space-y-4">
          <div className="space-y-2">
            <Label>{t("projectName")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("description")}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("datasets")}</Label>
            <Textarea
              value={datasets}
              onChange={(e) => setDatasets(e.target.value)}
              rows={3}
              placeholder={t("datasetsPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("evaluationMethods")}</Label>
            <Textarea
              value={evaluationMethods}
              onChange={(e) => setEvaluationMethods(e.target.value)}
              rows={3}
              placeholder={t("evaluationMethodsPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("computePool")}</Label>
            <Select value={computePoolUuid} onValueChange={setComputePoolUuid}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("noComputePool")}</SelectItem>
                {pools.map((pool) => (
                  <SelectItem key={pool.uuid} value={pool.uuid}>
                    {pool.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => startTransition(() => { void handleSave(); })}
              disabled={isPending || saving || !name.trim()}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("saving")}
                </>
              ) : (
                t("saveChanges")
              )}
            </Button>
            {saveMessage && (
              <span className="text-sm text-muted-foreground">{saveMessage}</span>
            )}
          </div>
        </div>
      </Card>

      {/* Section 2: GitHub Repository */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-foreground">{t("github")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("githubDesc")}</p>
        <div className="mt-5 space-y-4">
          <div className="space-y-2">
            <Label>{t("repoUrl")}</Label>
            <Input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder={t("repoUrlPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("githubUsername")}</Label>
            <Input
              value={githubUsername}
              onChange={(e) => setGithubUsername(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("githubToken")}</Label>
            <Input
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder={project.githubConfigured ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : t("githubTokenPlaceholder")}
            />
            <p className="text-xs text-muted-foreground">
              {project.githubConfigured ? t("githubConfigured") + ". " : t("githubNotConfigured") + ". "}
              {t("githubTokenHint")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => startTransition(() => { void handleSaveGithub(); })}
              disabled={isPending || savingGithub}
            >
              {savingGithub ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("saving")}
                </>
              ) : (
                t("saveChanges")
              )}
            </Button>
            {githubMessage && (
              <span className="text-sm text-muted-foreground">{githubMessage}</span>
            )}
          </div>
        </div>
      </Card>

      {/* Manage Experiments */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t("experiments")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("experimentCount", { count: project.experiments.length })}
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {project.experiments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noExperiments")}</p>
          ) : (
            project.experiments.map((experiment) => (
              <div
                key={experiment.uuid}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-foreground">
                    {experiment.title}
                  </span>
                  <Badge variant={statusVariant(experiment.status)}>
                    {statusLabel(experiment.status)}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteExperimentTarget(experiment)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Manage Research Questions */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {t("researchQuestions")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("questionCount", { count: project.researchQuestions.length })}
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {project.researchQuestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noQuestions")}</p>
          ) : (
            project.researchQuestions.map((question) => (
              <div
                key={question.uuid}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-foreground">
                    {question.title}
                  </span>
                  <Badge variant={statusVariant(question.status)}>
                    {statusLabel(question.status)}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteQuestionTarget(question)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/40 p-6">
        <h2 className="text-lg font-semibold text-destructive">{t("dangerZone")}</h2>
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">{t("deleteProject")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("deleteProjectDesc")}
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="ml-4 shrink-0"
              onClick={() => setShowDeleteProject(true)}
            >
              {t("deleteProject")}
            </Button>
          </div>
        </div>
      </Card>

      {/* Delete Experiment Dialog */}
      <AlertDialog
        open={!!deleteExperimentTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteExperimentTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteExperiment")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteExperimentTarget
                ? t("deleteExperimentConfirm", { title: deleteExperimentTarget.title })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteExperiment}
              disabled={deletingExperiment}
            >
              {deletingExperiment ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Research Question Dialog */}
      <AlertDialog
        open={!!deleteQuestionTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteQuestionTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteQuestion")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteQuestionTarget
                ? t("deleteQuestionConfirm", { title: deleteQuestionTarget.title })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteQuestion}
              disabled={deletingQuestion}
            >
              {deletingQuestion ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Project Dialog */}
      <AlertDialog
        open={showDeleteProject}
        onOpenChange={(open) => {
          if (!open) {
            setShowDeleteProject(false);
            setDeleteConfirmName("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteProjectConfirm")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>{t("deleteProjectWarn")}</p>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("typeToConfirm")}
                  </p>
                  <Input
                    className="mt-2"
                    placeholder={project.name}
                    value={deleteConfirmName}
                    onChange={(e) => setDeleteConfirmName(e.target.value)}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteProject}
              disabled={deletingProject || deleteConfirmName !== project.name}
            >
              {deletingProject ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {t("deleteProject")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
