"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  BookOpen,
  Bot,
  ChevronDown,
  Plus,
  LayoutDashboard,
  Lightbulb,
  FileText,
  CheckSquare,
  FolderKanban,
  Cpu,
  Settings,
  LineChart,
  LogOut,
  Menu,
} from "lucide-react";
import { authFetch, logout as authLogout, clearUserManager } from "@/lib/auth-client";
import { RealtimeProvider } from "@/contexts/realtime-context";
import { NotificationProvider } from "@/contexts/notification-context";
import { ToastProvider } from "@/contexts/toast-context";
import { NotificationBell } from "@/components/notification-bell";
import { NavigationProgress } from "@/components/navigation-progress";
import { OnboardingProgress } from "@/components/onboarding-progress";
import { Sheet, SheetContent } from "@/components/ui/sheet";

interface User {
  uuid: string;
  email: string;
  name: string;
}

interface Project {
  uuid: string;
  name: string;
}

// Extract research project UUID from URL
function extractProjectUuid(pathname: string): string | null {
  // Match /research-projects/[uuid] or /research-projects/[uuid]/anything
  const match = pathname.match(/^\/research-projects\/([a-f0-9-]{36})(\/|$)/);
  return match ? match[1] : null;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations();
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  // Close mobile drawer on navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Get current project UUID from URL (stateful URL)
  const currentProjectUuid = extractProjectUuid(pathname);
  const currentProject = projects.find((p) => p.uuid === currentProjectUuid) || null;

  // Global pages: /research-projects, /research-projects/new, /settings
  const isGlobalPage =
    pathname === "/research-projects" ||
    pathname === "/research-projects/new" ||
    pathname === "/compute" ||
    pathname === "/agents" ||
    pathname === "/settings" ||
    pathname.startsWith("/project-groups");
  const isProjectContext = currentProjectUuid && !isGlobalPage;

  useEffect(() => {
    checkSession();
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh project list when navigating (e.g. after deleting a project)
  useEffect(() => {
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const checkSession = async () => {
    try {
      // Use authFetch which adds OIDC Authorization header if available.
      // For default auth users (no OIDC), cookies are still sent automatically
      // and the server authenticates via the user_session httpOnly cookie.
      let response = await authFetch("/api/auth/session");

      // If access token expired, try refreshing with the refresh token cookie
      if (!response.ok) {
        const refreshRes = await fetch("/api/auth/refresh", { method: "POST" });
        if (refreshRes.ok) {
          // Refresh succeeded — retry session check with new cookies
          response = await authFetch("/api/auth/session");
        }
      }

      if (!response.ok) {
        clearUserManager();
        router.push("/login");
        return;
      }

      const data = await response.json();
      if (data.success && data.data.user) {
        setUser({
          uuid: data.data.user.uuid,
          email: data.data.user.email,
          name: data.data.user.name || data.data.user.email,
        });
      } else {
        clearUserManager();
        router.push("/login");
        return;
      }
    } catch (error) {
      console.error("Session check failed:", error);
      clearUserManager();
      router.push("/login");
      return;
    }

    setLoading(false);
  };

  const fetchProjects = async () => {
    try {
      const response = await authFetch("/api/research-projects");
      if (!response.ok) {
        console.error("Failed to fetch projects:", response.status);
        return;
      }
      const data = await response.json();
      const projectList = data.data?.data || data.data || [];
      if (data.success && Array.isArray(projectList) && projectList.length > 0) {
        setProjects(projectList);
      }
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    }
  };

  const selectProject = (project: Project) => {
    setProjectMenuOpen(false);
    // Navigate to project dashboard with UUID in URL
    router.push(`/research-projects/${project.uuid}/dashboard`);
  };

  const handleLogout = async () => {
    try {
      await authLogout();
    } catch {
      clearUserManager();
    }
    router.push("/login");
  };

  // Global navigation items
  const globalNavItems = useMemo(() => [
    { href: "/research-projects", label: t("nav.researchProjects"), icon: FolderKanban },
    { href: "/compute", label: t("nav.compute"), icon: Cpu },
    { href: "/agents", label: t("nav.agents"), icon: Bot },
    { href: "/settings", label: t("nav.settings"), icon: Settings },
  ], [t]);

  const projectNavItems = useMemo(() => {
    if (!currentProjectUuid) {
      return [];
    }

    return [
      { href: `/research-projects/${currentProjectUuid}/dashboard`, label: t("nav.overview"), icon: LayoutDashboard },
      { href: `/research-projects/${currentProjectUuid}/related-works`, label: t("nav.relatedWorks"), icon: BookOpen },
      { href: `/research-projects/${currentProjectUuid}/research-questions`, label: t("nav.researchQuestions"), icon: Lightbulb },
      { href: `/research-projects/${currentProjectUuid}/experiments`, label: t("nav.experiments"), icon: CheckSquare },
      { href: `/research-projects/${currentProjectUuid}/insights`, label: t("nav.insights"), icon: LineChart },
      { href: `/research-projects/${currentProjectUuid}/documents`, label: t("nav.documents"), icon: FileText },
      { href: `/research-projects/${currentProjectUuid}/settings`, label: t("nav.projectSettings"), icon: Settings },
    ];
  }, [currentProjectUuid, t]);

  useEffect(() => {
    globalNavItems.forEach((item) => {
      router.prefetch(item.href);
    });
  }, [globalNavItems, router]);

  useEffect(() => {
    projectNavItems.forEach((item) => {
      router.prefetch(item.href);
    });
  }, [projectNavItems, router]);

  // Proactive token refresh — prevent logout during long form stays
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      try {
        await fetch("/api/auth/refresh", { method: "POST" });
      } catch {
        // Refresh failed silently — next API call will handle redirect
      }
    }, 45 * 60 * 1000); // every 45 minutes
    return () => clearInterval(interval);
  }, [user]);

  // Auto-redirect to onboarding for brand-new users
  useEffect(() => {
    if (!user || onboardingChecked) return;
    authFetch("/api/onboarding/status")
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          const s = json.data;
          if (!s.hasAgent && !s.hasComputeNode && !s.hasProject) {
            router.replace("/onboarding");
          }
        }
      })
      .catch(() => {})
      .finally(() => setOnboardingChecked(true));
  }, [user, onboardingChecked, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  const isNavActive = (href: string) => {
    // Exact match for dashboard
    if (href.endsWith("/dashboard")) {
      return pathname === href;
    }
    // For /projects list page
    if (href === "/research-projects") {
      return pathname === "/research-projects";
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  // Shared sidebar content used by both desktop aside and mobile Sheet
  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => {
    // Mobile drawer uses larger text/icons since it has more room (280px vs 220px)
    const navTextSize = mobile ? "text-[15px]" : "text-[13px]";
    const navIconSize = mobile ? "h-5 w-5" : "h-4 w-4";
    const navGap = mobile ? "gap-1.5" : "gap-1";
    const navItemPy = mobile ? "h-10" : "";
    const smallTextSize = mobile ? "text-[13px]" : "text-[11px]";
    const profileNameSize = mobile ? "text-[15px]" : "text-[13px]";
    const profileEmailSize = mobile ? "text-[12px]" : "text-[11px]";

    return (
    <>
      <div className="flex flex-col gap-8 p-6">
        {/* Logo + Notification Bell */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/synapse-icon.png" alt="Synapse" width={28} height={28} className="h-7 w-7" />
            <span className="text-base font-semibold text-foreground">
              {t("common.appName")}
            </span>
          </div>
          <div className="hidden md:block">
            <NotificationBell />
          </div>
        </div>

        {/* Navigation */}
        <nav className={`flex flex-col ${navGap}`}>
          {isProjectContext && currentProjectUuid ? (
            <>
              {/* Back to Projects */}
              <Link href="/research-projects" prefetch>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`w-full justify-start gap-2.5 text-muted-foreground hover:text-foreground ${navTextSize} ${navItemPy}`}
                >
                  <ArrowLeft className={mobile ? "h-4 w-4" : "h-3 w-3"} />
                  {t("nav.backToResearchProjects")}
                </Button>
              </Link>

              {/* Current Project Selector */}
              {currentProject && (
                <div className="relative mt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setProjectMenuOpen(!projectMenuOpen)}
                    className="w-full justify-between px-3 py-1.5"
                  >
                    <span className={`truncate font-semibold uppercase tracking-wider text-foreground ${smallTextSize}`}>
                      {currentProject.name}
                    </span>
                    <ChevronDown
                      className={`h-3 w-3 text-muted-foreground transition-transform ${projectMenuOpen ? "rotate-180" : ""}`}
                    />
                  </Button>
                  {projectMenuOpen && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-border bg-card py-1 shadow-lg">
                      {projects.map((project) => (
                        <Button
                          key={project.uuid}
                          variant="ghost"
                          size="sm"
                          onClick={() => selectProject(project)}
                          className={`w-full justify-start px-3 py-2 ${navTextSize} [&>*]:truncate ${
                            currentProject?.uuid === project.uuid
                              ? "bg-secondary font-medium text-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          <span className="truncate">{project.name}</span>
                        </Button>
                      ))}
                      <div className="my-1 border-t border-border" />
                      <Link
                        href="/research-projects/new"
                        prefetch
                        onClick={() => setProjectMenuOpen(false)}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`w-full justify-start gap-2 px-3 py-2 ${navTextSize} text-primary`}
                        >
                          <Plus className="h-3 w-3" />
                          {t("nav.newResearchProject")}
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {/* Project Navigation Items */}
              <div className={`mt-2 flex flex-col ${navGap}`}>
                {projectNavItems.map((item) => {
                  const isActive = isNavActive(item.href);
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href} prefetch>
                      <Button
                        variant={isActive ? "secondary" : "ghost"}
                        size="sm"
                        className={`w-full justify-start gap-2.5 ${navTextSize} ${navItemPy} ${
                          isActive
                            ? "font-medium text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Icon
                          className={`${navIconSize} ${isActive ? "text-primary" : ""}`}
                        />
                        {item.label}
                      </Button>
                    </Link>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              {/* Global Navigation Items */}
              <div className={`flex flex-col ${navGap}`}>
                {globalNavItems.map((item) => {
                  const isActive = isNavActive(item.href);
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href} prefetch>
                      <Button
                        variant={isActive ? "secondary" : "ghost"}
                        size="sm"
                        className={`w-full justify-start gap-2.5 ${navTextSize} ${navItemPy} ${
                          isActive
                            ? "font-medium text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Icon className={navIconSize} />
                        {item.label}
                      </Button>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </nav>
      </div>

      <OnboardingProgress />
      {/* User Profile */}
      <div className="p-6">
        <div className="flex items-center gap-2">
          <div className={`flex items-center justify-center rounded-full bg-primary font-medium text-primary-foreground ${mobile ? "h-10 w-10 text-base" : "h-9 w-9 text-sm"}`}>
            {user?.name?.charAt(0) || "U"}
          </div>
          <div className="min-w-0 flex-1">
            <div className={`truncate font-medium text-foreground ${profileNameSize}`}>
              {user?.name}
            </div>
            <div className={`truncate text-muted-foreground ${profileEmailSize}`}>
              {user?.email}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            title={t("common.signOut")}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
    );
  };

  return (
    <ToastProvider>
    <NotificationProvider>
    <NavigationProgress />
    <div className="flex min-h-screen bg-background">
      {/* Mobile Header - visible below md */}
      <header className="fixed top-0 left-0 right-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card px-4 md:hidden">
        <button onClick={() => setMobileMenuOpen(true)} aria-label={t("nav.openMenu")}>
          <Menu className="h-5 w-5 text-muted-foreground" />
        </button>
        <div className="flex items-center gap-2">
          <Image src="/synapse-icon.png" alt="Synapse" width={24} height={24} className="h-6 w-6" />
          <span className="text-sm font-semibold text-foreground">{t("common.appName")}</span>
        </div>
        <NotificationBell />
      </header>

      {/* Mobile Drawer */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-[280px] p-0">
          <div className="flex h-full flex-col justify-between overflow-y-auto">
            <SidebarContent mobile />
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar - hidden below md */}
      <aside className="hidden md:sticky md:top-0 md:flex h-screen w-[220px] flex-shrink-0 flex-col justify-between overflow-y-auto border-r border-border bg-card">
        <SidebarContent />
      </aside>

      {/* Main Content - add top padding on mobile for the fixed header */}
      {isProjectContext && currentProject ? (
        <RealtimeProvider projectUuid={currentProject.uuid}>
          <main className="flex-1 overflow-auto pt-14 md:pt-0">{children}</main>
        </RealtimeProvider>
      ) : (
        <main className="flex-1 overflow-auto pt-14 md:pt-0">{children}</main>
      )}
    </div>
    </NotificationProvider>
    </ToastProvider>
  );
}
