import { prisma } from "@/lib/prisma";

export async function resetCompanyResearchDemoData(companyUuid: string) {
  const projectUuids = (
    await prisma.researchProject.findMany({
      where: { companyUuid },
      select: { uuid: true },
    })
  ).map((project) => project.uuid);

  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { companyUuid, researchProjectUuid: { in: projectUuids } } }),
    prisma.mention.deleteMany({ where: { companyUuid } }),
    prisma.comment.deleteMany({ where: { companyUuid } }),
    prisma.sessionRunCheckin.deleteMany({
      where: {
        run: {
          companyUuid,
        },
      },
    }),
    prisma.experimentGpuReservation.deleteMany({ where: { companyUuid } }),
    prisma.runGpuReservation.deleteMany({ where: { companyUuid } }),
    prisma.computeGpu.deleteMany({ where: { companyUuid } }),
    prisma.computeNode.deleteMany({ where: { companyUuid } }),
    prisma.computePool.deleteMany({ where: { companyUuid } }),
    prisma.acceptanceCriterion.deleteMany({
      where: {
        run: {
          companyUuid,
        },
      },
    }),
    prisma.runDependency.deleteMany({
      where: {
        OR: [
          { run: { companyUuid } },
          { dependsOnRun: { companyUuid } },
        ],
      },
    }),
    prisma.experiment.deleteMany({ where: { companyUuid } }),
    prisma.experimentRun.deleteMany({ where: { companyUuid } }),
    prisma.experimentDesign.deleteMany({ where: { companyUuid } }),
    prisma.document.deleteMany({ where: { companyUuid } }),
    prisma.activity.deleteMany({ where: { companyUuid } }),
    prisma.hypothesisFormulationQuestion.deleteMany({
      where: { round: { companyUuid } },
    }),
    prisma.hypothesisFormulation.deleteMany({ where: { companyUuid } }),
    prisma.researchQuestion.deleteMany({ where: { companyUuid } }),
    prisma.researchProject.deleteMany({ where: { companyUuid } }),
  ]);
}
