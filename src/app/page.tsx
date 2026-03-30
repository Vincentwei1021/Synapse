"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations();
  const router = useRouter();

  useEffect(() => {
    // Check if user is logged in by checking sessions
    const checkAuth = async () => {
      try {
        // Check admin session
        const adminResponse = await fetch("/api/admin/session");
        const adminData = await adminResponse.json();

        if (adminData.success) {
          router.replace("/admin");
          return;
        }

        // Check user session (works for both OIDC and default auth via cookie)
        const userResponse = await fetch("/api/auth/session");
        if (userResponse.ok) {
          const userData = await userResponse.json();
          if (userData.success) {
            router.replace("/research-projects");
            return;
          }
        }

        // Not logged in, redirect to login
        router.replace("/login");
      } catch {
        router.replace("/login");
      }
    };

    checkAuth();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAF8F4]">
      <div className="text-[#737373]">{t("common.loading")}</div>
    </div>
  );
}
