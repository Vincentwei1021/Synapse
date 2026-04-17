export interface NotificationEntityLabels {
  paper: string;
  researchQuestion: string;
  experiment: string;
  document: string;
  relatedWork: string;
  experimentRun: string;
  experimentDesign: string;
}

export interface NotificationLineItem {
  entityType: string;
  entityTitle: string;
}

function getNotificationEntityLabel(
  entityType: string,
  labels: NotificationEntityLabels,
): string {
  switch (entityType) {
    case "related_work":
      return labels.relatedWork;
    case "research_question":
      return labels.researchQuestion;
    case "experiment":
      return labels.experiment;
    case "document":
      return labels.document;
    case "experiment_run":
      return labels.experimentRun;
    case "experiment_design":
      return labels.experimentDesign;
    default:
      return labels.paper;
  }
}

export function formatNotificationEntityLine(
  notification: NotificationLineItem,
  labels: NotificationEntityLabels,
): string {
  return `${getNotificationEntityLabel(notification.entityType, labels)}: ${notification.entityTitle}`;
}

export function getNotificationStatusLine(
  action: string,
  translate: (key: string) => string,
): string {
  return translate(`types.${action}`);
}

export function getNotificationCardClassName({
  unread,
}: {
  unread: boolean;
}): string {
  return [
    "flex h-24 w-full gap-3 rounded-2xl border px-3 py-3 text-left transition-colors",
    "bg-white hover:bg-white/95 dark:bg-black dark:hover:bg-black/90",
    unread ? "border-primary/25 shadow-sm" : "border-border/70",
  ].join(" ");
}

