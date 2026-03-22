"use client";

import { type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DashboardTabsProps {
  overviewContent: ReactNode;
  metricsContent: ReactNode;
}

export function DashboardTabs({ overviewContent, metricsContent }: DashboardTabsProps) {
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="mb-6">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="metrics">Metrics Comparison</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        {overviewContent}
      </TabsContent>
      <TabsContent value="metrics">
        {metricsContent}
      </TabsContent>
    </Tabs>
  );
}
