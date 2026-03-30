"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  PendingMove,
  ProjectData,
  ProjectGroupData,
} from "./research-projects-page-shared";

export function useResearchProjectsPageData() {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [groups, setGroups] = useState<ProjectGroupData[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [projectsRes, groupsRes] = await Promise.all([
        fetch("/api/research-projects?pageSize=200"),
        fetch("/api/project-groups"),
      ]);
      const projectsJson = await projectsRes.json();
      const groupsJson = await groupsRes.json();

      if (projectsJson.success) {
        setProjects(projectsJson.data.data || projectsJson.data || []);
      }

      if (groupsJson.success) {
        setGroups(groupsJson.data.groups || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    groups,
    loading,
    pendingMove,
    projects,
    refresh,
    setPendingMove,
  };
}
