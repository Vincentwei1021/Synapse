"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { authFetch } from "@/lib/auth-client";

interface Project {
  uuid: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  ideas: { total: number; open: number; inProgress: number };
  tasks: { total: number; open: number; inProgress: number; toVerify: number };
  documents: { total: number };
  proposals: { total: number; pending: number };
}

export default function ProjectOverviewPage() {
  const params = useParams();
  const uuid = params.uuid as string;
  const t = useTranslations();
  const [project, setProject] = useState<Project | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (uuid) {
      fetchProject();
    }
  }, [uuid]);

  const fetchProject = async () => {
    try {
      const response = await authFetch(`/api/projects/${uuid}`);
      const data = await response.json();

      if (data.success) {
        setProject(data.data);
        // Save as current project
        localStorage.setItem("currentProjectUuid", uuid);
        // Fetch stats
        await fetchStats();
      } else {
        setError(data.error?.message || "Project not found");
      }
    } catch {
      setError("Failed to load project");
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      // Fetch ideas, tasks, documents, proposals counts
      const [ideasRes, tasksRes, docsRes, proposalsRes] = await Promise.all([
        authFetch(`/api/projects/${uuid}/ideas`),
        authFetch(`/api/projects/${uuid}/tasks`),
        authFetch(`/api/projects/${uuid}/documents`),
        authFetch(`/api/projects/${uuid}/proposals`),
      ]);

      const [ideas, tasks, docs, proposals] = await Promise.all([
        ideasRes.json(),
        tasksRes.json(),
        docsRes.json(),
        proposalsRes.json(),
      ]);

      const ideasData = ideas.success ? ideas.data : [];
      const tasksData = tasks.success ? tasks.data : [];
      const docsData = docs.success ? docs.data : [];
      const proposalsData = proposals.success ? proposals.data : [];

      setStats({
        ideas: {
          total: ideasData.length,
          open: ideasData.filter((i: { status: string }) => i.status === "open").length,
          inProgress: ideasData.filter((i: { status: string }) => i.status === "in_progress").length,
        },
        tasks: {
          total: tasksData.length,
          open: tasksData.filter((t: { status: string }) => t.status === "open").length,
          inProgress: tasksData.filter((t: { status: string }) => t.status === "in_progress").length,
          toVerify: tasksData.filter((t: { status: string }) => t.status === "to_verify").length,
        },
        documents: {
          total: docsData.length,
        },
        proposals: {
          total: proposalsData.length,
          pending: proposalsData.filter((p: { status: string }) => p.status === "pending").length,
        },
      });
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-[#6B6B6B]">{t("projectOverview.loadingProject")}</div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="border-[#E5E0D8] p-8 text-center">
          <div className="mb-4 text-4xl">404</div>
          <h2 className="mb-2 text-lg font-medium text-[#2C2C2C]">
            {t("projectOverview.notFoundTitle")}
          </h2>
          <p className="mb-4 text-sm text-[#6B6B6B]">{error}</p>
          <Link href="/projects">
            <Button className="bg-[#C67A52] hover:bg-[#B56A42] text-white">
              {t("projectOverview.backToProjects")}
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  const statCards = [
    {
      label: t("nav.ideas"),
      value: stats?.ideas.total || 0,
      subtext: t("projectOverview.ideasSubtext", { open: stats?.ideas.open || 0, inProgress: stats?.ideas.inProgress || 0 }),
      href: `/ideas`,
      color: "bg-[#FFF3E0]",
      iconColor: "text-[#E65100]",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
          <path d="M9 18h6" />
          <path d="M10 22h4" />
        </svg>
      ),
    },
    {
      label: t("nav.tasks"),
      value: stats?.tasks.total || 0,
      subtext: t("projectOverview.tasksSubtext", { open: stats?.tasks.open || 0, toVerify: stats?.tasks.toVerify || 0 }),
      href: `/tasks`,
      color: "bg-[#E3F2FD]",
      iconColor: "text-[#1976D2]",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
      ),
    },
    {
      label: t("nav.documents"),
      value: stats?.documents.total || 0,
      subtext: t("projectOverview.documentsSubtext"),
      href: `/documents`,
      color: "bg-[#E8F5E9]",
      iconColor: "text-[#5A9E6F]",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      ),
    },
    {
      label: t("nav.proposals"),
      value: stats?.proposals.total || 0,
      subtext: t("projectOverview.proposalsSubtext", { pending: stats?.proposals.pending || 0 }),
      href: `/proposals`,
      color: "bg-[#F3E5F5]",
      iconColor: "text-[#7B1FA2]",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
    },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-[#2C2C2C]">
                {project.name}
              </h1>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  project.status === "active"
                    ? "bg-[#E8F5E9] text-[#5A9E6F]"
                    : "bg-[#F5F2EC] text-[#6B6B6B]"
                }`}
              >
                {project.status}
              </span>
            </div>
            {project.description && (
              <p className="max-w-2xl text-sm text-[#6B6B6B]">
                {project.description}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            className="border-[#E5E0D8] text-[#6B6B6B] hover:bg-[#F5F2EC]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mr-2 h-4 w-4"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            {t("projectOverview.settings")}
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="group cursor-pointer border-[#E5E0D8] p-5 transition-all hover:border-[#C67A52] hover:shadow-md">
              <div className="mb-3 flex items-center justify-between">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.color}`}
                >
                  <span className={stat.iconColor}>{stat.icon}</span>
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4 text-[#9A9A9A] opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
              <div className="text-2xl font-semibold text-[#2C2C2C]">
                {stat.value}
              </div>
              <div className="text-sm font-medium text-[#6B6B6B]">
                {stat.label}
              </div>
              <div className="mt-1 text-xs text-[#9A9A9A]">{stat.subtext}</div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <Card className="border-[#E5E0D8] p-6">
        <h2 className="mb-4 text-lg font-medium text-[#2C2C2C]">
          {t("projectOverview.quickActions")}
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/ideas">
            <Button
              variant="outline"
              className="border-[#E5E0D8] text-[#6B6B6B] hover:bg-[#F5F2EC]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-2 h-4 w-4"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t("projectOverview.addIdea")}
            </Button>
          </Link>
          <Link href="/tasks">
            <Button
              variant="outline"
              className="border-[#E5E0D8] text-[#6B6B6B] hover:bg-[#F5F2EC]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-2 h-4 w-4"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
              {t("projectOverview.viewKanban")}
            </Button>
          </Link>
          <Link href="/documents">
            <Button
              variant="outline"
              className="border-[#E5E0D8] text-[#6B6B6B] hover:bg-[#F5F2EC]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-2 h-4 w-4"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              {t("projectOverview.browseDocuments")}
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
