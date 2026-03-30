import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ uuid: string }>;
}

export default async function LegacyExperimentDesignsPage({ params }: PageProps) {
  const { uuid } = await params;
  redirect(`/research-projects/${uuid}/experiments`);
}
