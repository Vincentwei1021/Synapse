// src/services/company.service.ts
// Company Service Layer (Super Admin Operations)
// UUID-Based Architecture: All operations use UUIDs

import { prisma } from "@/lib/prisma";
import { CompanyCreateInput, CompanyUpdateInput } from "@/types/admin";

// ===== Pagination Params =====
export interface PaginationParams {
  skip: number;
  take: number;
}

// ===== List =====
export async function listCompanies({ skip, take }: PaginationParams) {
  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      skip,
      take,
      orderBy: { createdAt: "desc" },
      select: {
        uuid: true,
        name: true,
        emailDomains: true,
        oidcEnabled: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            users: true,
            agents: true,
          },
        },
      },
    }),
    prisma.company.count(),
  ]);

  return { companies, total };
}

// ===== Get Details (by UUID) =====
export async function getCompanyByUuid(uuid: string) {
  return prisma.company.findFirst({
    where: { uuid },
    select: {
      id: true,
      uuid: true,
      name: true,
      emailDomains: true,
      oidcIssuer: true,
      oidcClientId: true,
      oidcEnabled: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          users: true,
          agents: true,
          researchProjects: true,
        },
      },
    },
  });
}

// ===== Find Company by Email Domain =====
export async function getCompanyByEmailDomain(email: string) {
  // Extract email domain
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) {
    return null;
  }

  // Find Company containing this domain
  return prisma.company.findFirst({
    where: {
      emailDomains: {
        has: domain,
      },
      oidcEnabled: true,
    },
    select: {
      uuid: true,
      name: true,
      oidcIssuer: true,
      oidcClientId: true,
    },
  });
}

// ===== Create =====
export async function createCompany(data: CompanyCreateInput) {
  // Process email domains (lowercase)
  const emailDomains = (data.emailDomains || []).map((d) => d.toLowerCase());

  // Determine if OIDC is enabled (requires issuer and clientId)
  const oidcEnabled = !!(data.oidcIssuer && data.oidcClientId);

  return prisma.company.create({
    data: {
      name: data.name,
      emailDomains,
      oidcIssuer: data.oidcIssuer || null,
      oidcClientId: data.oidcClientId || null,
      oidcEnabled,
    },
    select: {
      uuid: true,
      name: true,
      emailDomains: true,
      oidcIssuer: true,
      oidcClientId: true,
      oidcEnabled: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

// ===== Update =====
export async function updateCompany(id: number, data: CompanyUpdateInput) {
  // Process email domains (lowercase)
  const updateData: CompanyUpdateInput = { ...data };
  if (data.emailDomains) {
    updateData.emailDomains = data.emailDomains.map((d) => d.toLowerCase());
  }

  return prisma.company.update({
    where: { id },
    data: updateData,
    select: {
      uuid: true,
      name: true,
      emailDomains: true,
      oidcIssuer: true,
      oidcClientId: true,
      oidcEnabled: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

// ===== Delete =====
export async function deleteCompany(id: number) {
  // Note: this will delete the Company and all associated data
  // Since relationMode = "prisma" is used, cascade deletes must be handled manually
  return prisma.$transaction(async (tx) => {
    // Get company info
    const company = await tx.company.findUnique({
      where: { id },
      select: { uuid: true },
    });

    if (!company) {
      throw new Error("Company not found");
    }

    // Delete associated data (in dependency order) - use companyUuid
    const companyUuid = company.uuid;
    await tx.activity.deleteMany({ where: { companyUuid } });
    await tx.comment.deleteMany({ where: { companyUuid } });
    await tx.experimentDesign.deleteMany({ where: { companyUuid } });
    await tx.experimentRun.deleteMany({ where: { companyUuid } });
    await tx.document.deleteMany({ where: { companyUuid } });
    await tx.researchQuestion.deleteMany({ where: { companyUuid } });
    await tx.researchProject.deleteMany({ where: { companyUuid } });
    await tx.apiKey.deleteMany({ where: { companyUuid } });
    await tx.agent.deleteMany({ where: { companyUuid } });
    await tx.user.deleteMany({ where: { companyUuid } });

    // Finally delete the Company
    return tx.company.delete({ where: { id } });
  });
}

// ===== Statistics =====
export async function getCompanyStats() {
  const [totalCompanies, totalUsers, totalAgents] = await Promise.all([
    prisma.company.count(),
    prisma.user.count(),
    prisma.agent.count(),
  ]);

  return { totalCompanies, totalUsers, totalAgents };
}

// ===== Find Company by Email Domain (without oidcEnabled restriction) =====
export async function getCompanyByEmailDomainAny(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) {
    return null;
  }

  return prisma.company.findFirst({
    where: {
      emailDomains: {
        has: domain,
      },
    },
    select: {
      id: true,
      uuid: true,
      name: true,
      oidcIssuer: true,
      oidcClientId: true,
      oidcEnabled: true,
    },
  });
}

// ===== Check if Email Domain is Already Taken =====
export async function isEmailDomainTaken(
  domain: string,
  excludeCompanyId?: number
) {
  const company = await prisma.company.findFirst({
    where: {
      emailDomains: {
        has: domain.toLowerCase(),
      },
      ...(excludeCompanyId ? { id: { not: excludeCompanyId } } : {}),
    },
    select: { id: true },
  });

  return !!company;
}
