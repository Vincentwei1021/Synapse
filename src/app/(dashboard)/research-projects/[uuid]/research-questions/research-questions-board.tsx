"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Check, CornerUpLeft, FlaskConical, Pencil, PlayCircle, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useRealtimeRefresh } from "@/contexts/realtime-context";
import type { ExperimentResponse } from "@/services/experiment.service";
import type { ResearchQuestionResponse } from "@/services/research-question.service";
import { IdeaCreateForm } from "./question-create-form";
import {
  deleteResearchQuestionAction,
  reviewResearchQuestionAction,
  setResearchQuestionStatusAction,
} from "./actions";

const COLUMN_GAP = 360;
const ROW_GAP = 220;

type QuestionNodeData = {
  nodeKind: "question";
  title: string;
  summary: string | null;
  statusLabel: string;
  reviewLabel: string;
  sourceLabel: string;
  experimentCountLabel: string;
  childCountLabel: string;
  selected: boolean;
};

type ExperimentNodeData = {
  nodeKind: "experiment";
  title: string;
  statusLabel: string;
  outcome: string | null;
  updatedLabel: string;
  parentContextLabel: string | null;
};

type CanvasNodeData = QuestionNodeData | ExperimentNodeData;

function QuestionNode({ data }: NodeProps<Node<QuestionNodeData>>) {
  return (
    <div
      className={[
        "w-[280px] rounded-[28px] border bg-card p-4 shadow-sm transition-all",
        data.selected
          ? "border-primary ring-4 ring-primary/20"
          : "border-border hover:border-primary/30",
      ].join(" ")}
    >
      <Handle id="parent-target" type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-primary opacity-0" />
      <Handle id="peer-target" type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-primary opacity-0" />
      <Handle id="peer-source" type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-primary opacity-0" />
      <Handle id="child-source" type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-primary opacity-0" />
      <Handle id="experiment-source" type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-primary opacity-0" />

      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <Badge variant={data.selected ? "default" : "outline"} className="rounded-full">
              {data.statusLabel}
            </Badge>
            <h3 className="line-clamp-2 text-sm font-semibold leading-6 text-foreground">{data.title}</h3>
          </div>
          <Badge variant="secondary" className="rounded-full">
            {data.sourceLabel}
          </Badge>
        </div>

        {data.summary ? (
          <p className="line-clamp-3 text-xs leading-5 text-muted-foreground">{data.summary}</p>
        ) : null}

        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-full bg-secondary px-2.5 py-1">{data.reviewLabel}</span>
          <span className="rounded-full bg-secondary px-2.5 py-1">{data.experimentCountLabel}</span>
          <span className="rounded-full bg-secondary px-2.5 py-1">{data.childCountLabel}</span>
        </div>
      </div>
    </div>
  );
}

function ExperimentNode({ data }: NodeProps<Node<ExperimentNodeData>>) {
  return (
    <div className="w-[260px] rounded-[24px] border border-border bg-card p-4 shadow-sm">
      <Handle id="question-target" type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-emerald-600 opacity-0" />
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 text-sm font-semibold leading-6 text-foreground">{data.title}</h3>
          <Badge variant="outline" className="rounded-full">
            {data.statusLabel}
          </Badge>
        </div>
        {data.outcome ? (
          <p className="text-xs leading-5 text-muted-foreground">{data.outcome}</p>
        ) : null}
        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-full bg-secondary px-2.5 py-1">{data.updatedLabel}</span>
          {data.parentContextLabel ? (
            <span className="rounded-full bg-[#EAF4EF] px-2.5 py-1 text-[#2F7D5D] dark:bg-[#143125] dark:text-[#C3E9D4]">
              {data.parentContextLabel}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const nodeTypes = {
  question: QuestionNode,
  experiment: ExperimentNode,
};

function reviewLabelForQuestion(t: ReturnType<typeof useTranslations>, question: ResearchQuestionResponse) {
  if (question.reviewStatus === "pending") return t("ideas.pendingReview");
  if (question.reviewStatus === "accepted") return t("ideas.accepted");
  return t("ideas.rejected");
}

function sourceLabelForQuestion(t: ReturnType<typeof useTranslations>, question: ResearchQuestionResponse) {
  return question.sourceType === "agent" ? t("ideas.agentGenerated") : t("ideas.humanCreated");
}

function statusLabelForQuestion(t: ReturnType<typeof useTranslations>, question: ResearchQuestionResponse) {
  const statusKey =
    question.status === "proposal_created" || question.status === "experiment_created"
      ? "experimentCreated"
      : question.status === "elaborating"
        ? "elaborating"
        : question.status === "completed"
          ? "completed"
          : "open";
  return t(`ideas.columns.${statusKey}`);
}

function statusLabelForExperiment(t: ReturnType<typeof useTranslations>, experiment: ExperimentResponse) {
  const key =
    experiment.status === "pending_review"
      ? "pendingReview"
      : experiment.status === "pending_start"
        ? "pendingStart"
        : experiment.status === "in_progress"
          ? "inProgress"
          : experiment.status === "completed"
            ? "completed"
            : "draft";
  return t(`experiments.columns.${key}`);
}

function buildQuestionLayout(questions: ResearchQuestionResponse[]) {
  const byParent = new Map<string | null, ResearchQuestionResponse[]>();
  const widths = new Map<string, number>();
  const positions = new Map<string, { x: number; y: number }>();

  for (const question of questions) {
    const key = question.parentQuestionUuid ?? null;
    const current = byParent.get(key) ?? [];
    current.push(question);
    byParent.set(key, current);
  }

  const sortQuestions = (items: ResearchQuestionResponse[]) =>
    [...items].sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  const subtreeWidth = (question: ResearchQuestionResponse): number => {
    if (widths.has(question.uuid)) {
      return widths.get(question.uuid) ?? 1;
    }

    const children = sortQuestions(byParent.get(question.uuid) ?? []);
    const width =
      children.length === 0 ? 1 : Math.max(1, children.reduce((sum, child) => sum + subtreeWidth(child), 0));
    widths.set(question.uuid, width);
    return width;
  };

  const placeSubtree = (question: ResearchQuestionResponse, startUnit: number, depth: number) => {
    const width = subtreeWidth(question);
    const children = sortQuestions(byParent.get(question.uuid) ?? []);
    const centerUnit = startUnit + width / 2;
    positions.set(question.uuid, {
      x: centerUnit * COLUMN_GAP,
      y: depth * ROW_GAP,
    });

    let cursor = startUnit;
    for (const child of children) {
      const childWidth = subtreeWidth(child);
      placeSubtree(child, cursor, depth + 1);
      cursor += childWidth;
    }
  };

  const roots = sortQuestions(byParent.get(null) ?? []);
  let rootCursor = 0;
  for (const root of roots) {
    const width = subtreeWidth(root);
    placeSubtree(root, rootCursor, 0);
    rootCursor += width + 0.2;
  }

  return { positions, roots };
}

export function ResearchQuestionsBoard({
  projectUuid,
  researchQuestions,
  experiments,
}: {
  projectUuid: string;
  researchQuestions: ResearchQuestionResponse[];
  experiments: ExperimentResponse[];
}) {
  const t = useTranslations();
  const [isPending, startTransition] = useTransition();
  const [selectedQuestionUuid, setSelectedQuestionUuid] = useState<string | null>(researchQuestions[0]?.uuid ?? null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  useRealtimeRefresh();

  useEffect(() => {
    if (researchQuestions.length === 0) {
      setSelectedQuestionUuid(null);
      return;
    }

    if (!selectedQuestionUuid || !researchQuestions.some((question) => question.uuid === selectedQuestionUuid)) {
      setSelectedQuestionUuid(researchQuestions[0]?.uuid ?? null);
    }
  }, [researchQuestions, selectedQuestionUuid]);

  const selectedQuestion = useMemo(
    () => researchQuestions.find((question) => question.uuid === selectedQuestionUuid) ?? null,
    [researchQuestions, selectedQuestionUuid],
  );

  const selectedExperiments = useMemo(
    () =>
      experiments
        .filter((experiment) => experiment.researchQuestionUuid === selectedQuestionUuid)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [experiments, selectedQuestionUuid],
  );

  const flow = useMemo(() => {
    const { positions, roots } = buildQuestionLayout(researchQuestions);
    const nodes: Node<CanvasNodeData>[] = researchQuestions.map((question) => {
      const position = positions.get(question.uuid) ?? { x: 0, y: 0 };
      return {
        id: `q-${question.uuid}`,
        type: "question",
        position,
        draggable: false,
        data: {
          nodeKind: "question",
          title: question.title,
          summary: question.content,
          statusLabel: statusLabelForQuestion(t, question),
          reviewLabel: reviewLabelForQuestion(t, question),
          sourceLabel: sourceLabelForQuestion(t, question),
          experimentCountLabel: t("ideas.experimentCount", { count: question.experimentCount }),
          childCountLabel: t("ideas.childCount", { count: question.childQuestionUuids.length }),
          selected: question.uuid === selectedQuestionUuid,
        },
      };
    });

    const edges: Edge[] = [];

    for (const question of researchQuestions) {
      if (question.parentQuestionUuid) {
        edges.push({
          id: `parent-${question.parentQuestionUuid}-${question.uuid}`,
          source: `q-${question.parentQuestionUuid}`,
          target: `q-${question.uuid}`,
          sourceHandle: "child-source",
          targetHandle: "parent-target",
          type: "straight",
          style: { stroke: "#C67A52", strokeWidth: 2.2 },
        });
      }
    }

    if (roots.length > 1) {
      for (let index = 0; index < roots.length - 1; index += 1) {
        edges.push({
          id: `peer-${roots[index].uuid}-${roots[index + 1].uuid}`,
          source: `q-${roots[index].uuid}`,
          target: `q-${roots[index + 1].uuid}`,
          sourceHandle: "peer-source",
          targetHandle: "peer-target",
          type: "straight",
          selectable: false,
          style: {
            stroke: "#D0C3B5",
            strokeWidth: 1.6,
            strokeDasharray: "8 6",
          },
        });
      }
    }

    return { nodes, edges };
  }, [researchQuestions, selectedQuestionUuid, t]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CanvasNodeData>>(flow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(flow.edges);

  useEffect(() => {
    setNodes(flow.nodes);
    setEdges(flow.edges);
  }, [flow, setEdges, setNodes]);

  const handleNodeClick = (_event: React.MouseEvent, node: Node<CanvasNodeData>) => {
    if (node.data.nodeKind === "question") {
      setSelectedQuestionUuid(node.id.replace("q-", ""));
    }
  };

  const runStatusAction = (status: "elaborating" | "proposal_created" | "completed") => {
    if (!selectedQuestion) return;

    startTransition(() => {
      void setResearchQuestionStatusAction({
        projectUuid,
        questionUuid: selectedQuestion.uuid,
        status,
      });
    });
  };

  const handleDeleteSelectedQuestion = () => {
    if (!selectedQuestion) return;

    startTransition(() => {
      void (async () => {
        await deleteResearchQuestionAction(selectedQuestion.uuid, projectUuid);
        setDeleteDialogOpen(false);
        setSelectedQuestionUuid(null);
      })();
    });
  };

  return (
    <div className="space-y-5">
      <div className="relative min-h-[680px] overflow-hidden rounded-[32px] border border-border bg-background">
        {researchQuestions.length > 0 ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-end p-4">
            <div className="pointer-events-auto">
              <IdeaCreateForm
                projectUuid={projectUuid}
                researchQuestions={researchQuestions.map((question) => ({
                  uuid: question.uuid,
                  title: question.title,
                }))}
              />
            </div>
          </div>
        ) : null}

        {researchQuestions.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <Card className="w-full max-w-xl rounded-[32px] border-border bg-card p-8 text-center shadow-sm">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Plus className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">{t("ideas.emptyTitle")}</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{t("ideas.emptyDesc")}</p>
              <div className="mt-6 flex justify-center">
                <IdeaCreateForm projectUuid={projectUuid} buttonLabel={t("ideas.createRoot")} />
              </div>
            </Card>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            fitView
            fitViewOptions={{ padding: 0.18, minZoom: 0.65 }}
            minZoom={0.35}
            maxZoom={1.5}
            panOnDrag
            selectionOnDrag
            nodesDraggable={false}
            proOptions={{ hideAttribution: true }}
            className="min-h-[680px]"
          >
            <Background color="rgba(198, 122, 82, 0.12)" gap={24} />
            <Controls className="synapse-flow-controls" />
          </ReactFlow>
        )}
      </div>

      {selectedQuestion ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.95fr)]">
          <Card className="rounded-[28px] border-border bg-card p-6 shadow-none">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{t("ideas.selected")}</Badge>
                  <Badge variant="outline">{statusLabelForQuestion(t, selectedQuestion)}</Badge>
                  <Badge variant="secondary">{reviewLabelForQuestion(t, selectedQuestion)}</Badge>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{selectedQuestion.title}</h2>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    {selectedQuestion.content || t("common.noDescription")}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <IdeaCreateForm
                  mode="edit"
                  projectUuid={projectUuid}
                  questionUuid={selectedQuestion.uuid}
                  researchQuestions={researchQuestions.map((question) => ({
                    uuid: question.uuid,
                    title: question.title,
                  }))}
                  initialTitle={selectedQuestion.title}
                  initialContent={selectedQuestion.content}
                  initialParentQuestionUuid={selectedQuestion.parentQuestionUuid ?? null}
                  buttonLabel={t("ideas.editQuestion")}
                  trigger={
                    <Button variant="outline">
                      <Pencil className="mr-2 h-4 w-4" />
                      {t("ideas.editQuestion")}
                    </Button>
                  }
                />
                <IdeaCreateForm
                  projectUuid={projectUuid}
                  researchQuestions={researchQuestions.map((question) => ({
                    uuid: question.uuid,
                    title: question.title,
                  }))}
                  buttonLabel={t("ideas.createChild")}
                  defaultParentQuestionUuid={selectedQuestion.uuid}
                />
                <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10">
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t("ideas.deleteResearchQuestion")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("ideas.deleteResearchQuestion")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("ideas.deleteResearchQuestionCascadeConfirm", { title: selectedQuestion.title })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={handleDeleteSelectedQuestion}
                        disabled={isPending}
                      >
                        {t("common.delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-secondary/80 px-4 py-3">
                <p className="text-xs text-muted-foreground">{t("ideas.card.parent")}</p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {researchQuestions.find((question) => question.uuid === selectedQuestion.parentQuestionUuid)?.title ||
                    t("ideas.noParent")}
                </p>
              </div>
              <div className="rounded-2xl bg-secondary/80 px-4 py-3">
                <p className="text-xs text-muted-foreground">{t("ideas.card.children")}</p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {t("ideas.childCount", { count: selectedQuestion.childQuestionUuids.length })}
                </p>
              </div>
              <div className="rounded-2xl bg-secondary/80 px-4 py-3">
                <p className="text-xs text-muted-foreground">{t("ideas.card.experiments")}</p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {t("ideas.experimentCount", { count: selectedQuestion.experimentCount })}
                </p>
              </div>
            </div>

            {selectedQuestion.experimentCount > 0 ? (
              <p className="mt-4 text-xs leading-6 text-muted-foreground">{t("ideas.inheritsParentExperiments")}</p>
            ) : null}
          </Card>

          <Card className="rounded-[28px] border-border bg-card p-6 shadow-none">
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">{t("ideas.inspectorTitle")}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("ideas.parallelHint")}</p>
              </div>

              {selectedQuestion.reviewStatus === "pending" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(() => {
                        void reviewResearchQuestionAction({
                          projectUuid,
                          questionUuid: selectedQuestion.uuid,
                          reviewStatus: "accepted",
                        });
                      })
                    }
                  >
                    <Check className="mr-2 h-4 w-4" />
                    {t("common.approve")}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(() => {
                        void reviewResearchQuestionAction({
                          projectUuid,
                          questionUuid: selectedQuestion.uuid,
                          reviewStatus: "rejected",
                        });
                      })
                    }
                  >
                    {t("common.reject")}
                  </Button>
                </div>
              ) : null}

              {selectedQuestion.reviewStatus === "accepted" && selectedQuestion.status === "open" ? (
                <Button
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={isPending}
                  onClick={() => runStatusAction("elaborating")}
                >
                  <PlayCircle className="mr-2 h-4 w-4" />
                  {t("ideas.actions.startElaboration")}
                </Button>
              ) : null}

              {selectedQuestion.reviewStatus === "accepted" && selectedQuestion.status === "elaborating" ? (
                <Button
                  className="w-full bg-emerald-700 text-white hover:bg-emerald-600"
                  disabled={isPending}
                  onClick={() => runStatusAction("proposal_created")}
                >
                  <FlaskConical className="mr-2 h-4 w-4" />
                  {t("ideas.actions.markExperimentCreated")}
                </Button>
              ) : null}

              {selectedQuestion.reviewStatus === "accepted" &&
              (selectedQuestion.status === "proposal_created" || selectedQuestion.status === "experiment_created") ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button variant="outline" disabled={isPending} onClick={() => runStatusAction("elaborating")}>
                    <CornerUpLeft className="mr-2 h-4 w-4" />
                    {t("ideas.actions.backToElaboration")}
                  </Button>
                  <Button
                    className="bg-emerald-700 text-white hover:bg-emerald-600"
                    disabled={isPending}
                    onClick={() => runStatusAction("completed")}
                  >
                    <Check className="mr-2 h-4 w-4" />
                    {t("ideas.actions.markCompleted")}
                  </Button>
                </div>
              ) : null}

              <div className="space-y-3 border-t border-border pt-4">
                <h3 className="text-sm font-semibold text-foreground">{t("ideas.linkedExperiments")}</h3>
                {selectedExperiments.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-secondary/40 px-4 py-6 text-sm text-muted-foreground">
                    {t("ideas.noLinkedExperiments")}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedExperiments.map((experiment) => (
                      <div
                        key={experiment.uuid}
                        className="rounded-2xl border border-border bg-background px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">{experiment.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {statusLabelForExperiment(t, experiment)}
                            </p>
                          </div>
                          {experiment.outcome ? <Badge variant="outline">{experiment.outcome}</Badge> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
