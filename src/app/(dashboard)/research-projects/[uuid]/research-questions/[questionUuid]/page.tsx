import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ uuid: string }>;
}

export default async function ResearchQuestionRedirectPage({ params }: PageProps) {
  const { uuid } = await params;
  redirect(`/research-projects/${uuid}/research-questions`);
}
