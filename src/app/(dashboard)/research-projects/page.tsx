"use client";

import { useState } from "react";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { useTranslations } from "next-intl";
import { MoveProjectConfirmDialog } from "@/components/move-research-project-confirm-dialog";
import { CreateProjectGroupDialog } from "@/components/create-project-group-dialog";
import { CreateProjectDialog } from "@/components/create-research-project-dialog";
import {
  GroupSection,
  ProjectsEmptyState,
  ProjectsPageHeader,
  UngroupedSection,
} from "./research-projects-page-sections";
import {
  getGroupStats,
  groupProjectsByGroup,
  UNGROUPED_DROPPABLE_ID,
} from "./research-projects-page-shared";
import { useResearchProjectsPageData } from "./use-research-projects-page-data";

export default function ProjectsPage() {
  const t = useTranslations();
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [createResearchProjectTarget, setCreateProjectTarget] = useState<{
    groupUuid: string | null;
    groupName: string;
  } | null>(null);

  const getGroupName = (groupUuid: string | null) => {
    if (!groupUuid) return t("projectGroups.ungrouped");
    const group = groups.find((item) => item.uuid === groupUuid);
    return group?.name ?? t("projectGroups.ungrouped");
  };

  const {
    groups,
    loading,
    pendingMove,
    projects,
    refresh,
    setPendingMove,
  } = useResearchProjectsPageData();

  const { projectsByGroup, ungroupedProjects } = groupProjectsByGroup(projects);

  function handleDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;

    const project = projects.find((item) => item.uuid === draggableId);
    if (!project) return;

    const targetGroupUuid =
      destination.droppableId === UNGROUPED_DROPPABLE_ID
        ? null
        : destination.droppableId;

    setPendingMove({
      projectUuid: project.uuid,
      projectName: project.name,
      sourceGroupName: getGroupName(project.groupUuid),
      targetGroupUuid,
      targetGroupName: getGroupName(targetGroupUuid),
    });
  }

  async function handleConfirmMove() {
    if (!pendingMove) return;

    const response = await fetch(`/api/research-projects/${pendingMove.projectUuid}/group`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupUuid: pendingMove.targetGroupUuid }),
    });
    const json = await response.json();

    if (!json.success) {
      throw new Error(json.error || t("projectGroups.moveFailed"));
    }

    await refresh();
  }

  if (loading) {
    return (
      <div className="min-h-full bg-background p-4 md:p-8">
        <p className="text-sm text-muted-foreground">
          {t("projects.loadingProjects")}
        </p>
      </div>
    );
  }

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="min-h-full bg-background p-4 md:p-8">
          <ProjectsPageHeader onCreateGroup={() => setShowCreateGroup(true)} />

          {projects.length === 0 && groups.length === 0 ? (
            <ProjectsEmptyState />
          ) : (
            <div className="space-y-5">
              {groups.map((group) => {
                const groupProjects = projectsByGroup.get(group.uuid) || [];
                const stats = getGroupStats(groupProjects);

                return (
                  <GroupSection
                    key={group.uuid}
                    group={group}
                    projects={groupProjects}
                    stats={stats}
                    onNewProject={() => setCreateProjectTarget({ groupUuid: group.uuid, groupName: group.name })}
                  />
                );
              })}

              <UngroupedSection
                projects={ungroupedProjects}
                onNewProject={() => setCreateProjectTarget({ groupUuid: null, groupName: t("projectGroups.ungrouped") })}
              />
            </div>
          )}
        </div>
      </DragDropContext>

      <MoveProjectConfirmDialog
        open={pendingMove !== null}
        onOpenChange={(open) => {
          if (!open) setPendingMove(null);
        }}
        projectName={pendingMove?.projectName ?? ""}
        sourceGroupName={pendingMove?.sourceGroupName ?? ""}
        targetGroupName={pendingMove?.targetGroupName ?? ""}
        onConfirm={handleConfirmMove}
      />

      <CreateProjectGroupDialog
        open={showCreateGroup}
        onOpenChange={setShowCreateGroup}
        onCreated={() => {
          setShowCreateGroup(false);
          refresh();
        }}
      />

      <CreateProjectDialog
        open={createResearchProjectTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCreateProjectTarget(null);
        }}
        groupUuid={createResearchProjectTarget?.groupUuid ?? null}
        groupName={createResearchProjectTarget?.groupName ?? ""}
        onCreated={() => {
          setCreateProjectTarget(null);
          refresh();
        }}
      />
    </>
  );
}
