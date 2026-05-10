import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ uuid: string }>;
}

// Research Project root redirects to the Dashboard sub-route so that
// `/research-projects/<uuid>` is a valid entry point.
export default async function ResearchProjectRootPage({ params }: PageProps) {
  const { uuid } = await params;
  redirect(`/research-projects/${uuid}/dashboard`);
}
