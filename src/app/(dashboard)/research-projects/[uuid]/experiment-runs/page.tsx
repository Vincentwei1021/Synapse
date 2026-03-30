import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ uuid: string }>;
}

export default async function LegacyExperimentRunsPage({ params }: PageProps) {
  const { uuid } = await params;
  redirect(`/research-projects/${uuid}/experiments`);
}
