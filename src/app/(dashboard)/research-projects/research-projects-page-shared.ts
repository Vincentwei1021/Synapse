export interface ProjectData {
  uuid: string;
  name: string;
  description: string | null;
  groupUuid: string | null;
  createdAt: string;
  updatedAt: string;
  counts: {
    ideas: number;
    documents: number;
    tasks: number;
    doneTasks: number;
    proposals: number;
  };
}

export interface ProjectGroupData {
  uuid: string;
  name: string;
  description: string | null;
  projectCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PendingMove {
  projectUuid: string;
  projectName: string;
  sourceGroupName: string;
  targetGroupUuid: string | null;
  targetGroupName: string;
}

export interface GroupStats {
  totalTasks: number;
  completedTasks: number;
  openIdeas: number;
}

export const UNGROUPED_DROPPABLE_ID = "__ungrouped__";

const AVATAR_COLORS = [
  "#C67A52",
  "#1976D2",
  "#5A9E6F",
  "#8E6BBF",
  "#D4805A",
  "#2E86AB",
  "#A45A52",
  "#6B8E5A",
];

export function getProjectInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function groupProjectsByGroup(projects: ProjectData[]) {
  const projectsByGroup = new Map<string, ProjectData[]>();
  const ungroupedProjects: ProjectData[] = [];

  for (const project of projects) {
    if (project.groupUuid) {
      const existing = projectsByGroup.get(project.groupUuid) ?? [];
      existing.push(project);
      projectsByGroup.set(project.groupUuid, existing);
    } else {
      ungroupedProjects.push(project);
    }
  }

  return { projectsByGroup, ungroupedProjects };
}

export function getGroupStats(groupProjects: ProjectData[]): GroupStats {
  let totalTasks = 0;
  let completedTasks = 0;
  let openIdeas = 0;

  for (const project of groupProjects) {
    totalTasks += project.counts.tasks;
    completedTasks += project.counts.doneTasks;
    openIdeas += project.counts.ideas;
  }

  return { totalTasks, completedTasks, openIdeas };
}
