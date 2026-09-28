import { type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { BusinessRuleError, created, handleApiError, ok, readJson } from "@/lib/api";

const SCOPE = "subjects";

const createSchema = z.object({ name: z.string().trim().min(1).max(100) });

export async function GET() {
  try {
    const ctx = await requirePermission("academic.subjects.manage");
    const subjects = await db.subject.findMany({
      where: { organizationId: ctx.organizationId, deletedAt: null },
      orderBy: { name: "asc" },
      // Subject has no direct Group relation — only exams can be counted.
      include: { _count: { select: { exams: true } } }
    });
    return ok(subjects);
  } catch (err) {
    return handleApiError(SCOPE, err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePermission("academic.subjects.manage");
    const input = await readJson(request, createSchema);

    const existing = await db.subject.findFirst({
      where: { organizationId: ctx.organizationId, name: input.name }
    });
    if (existing) {
      throw new BusinessRuleError("A subject with this name already exists.", { status: 409 });
    }

    const subject = await db.subject.create({
      data: { organizationId: ctx.organizationId, name: input.name }
    });

    await writeAuditLog({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "CREATE_SUBJECT",
      entityType: "Subject",
      entityId: subject.id,
      afterValue: subject
    });

    return created(subject);
  } catch (err) {
    return handleApiError(SCOPE, err);
  }
}
