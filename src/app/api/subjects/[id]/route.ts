import { type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { BusinessRuleError, NotFoundError, handleApiError, ok, readJson } from "@/lib/api";

const SCOPE = "subjects.detail";

const updateSchema = z.object({ name: z.string().trim().min(1).max(100) });

async function loadSubject(organizationId: string, id: string) {
  const subject = await db.subject.findFirst({
    where: { id, organizationId, deletedAt: null },
    // Subject has no direct relation to Group — it only connects to
    // groups indirectly through Exam — so only exams can be counted here.
    include: { _count: { select: { exams: true } } }
  });
  if (!subject) throw new NotFoundError("Subject not found.");
  return subject;
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("academic.subjects.manage");
    const subject = await loadSubject(ctx.organizationId, params.id);
    const input = await readJson(request, updateSchema);

    const updated = await db.subject.update({ where: { id: subject.id }, data: { name: input.name } });

    await writeAuditLog({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "UPDATE_SUBJECT",
      entityType: "Subject",
      entityId: subject.id,
      beforeValue: { name: subject.name },
      afterValue: { name: updated.name }
    });

    return ok(updated);
  } catch (err) {
    return handleApiError(SCOPE, err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission("academic.subjects.manage");
    const subject = await loadSubject(ctx.organizationId, params.id);

    if (subject._count.exams > 0) {
      throw new BusinessRuleError("This subject still has exams. Archive them before removing it.");
    }

    await db.subject.update({ where: { id: subject.id }, data: { deletedAt: new Date() } });

    await writeAuditLog({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "DELETE_SUBJECT",
      entityType: "Subject",
      entityId: subject.id,
      beforeValue: { name: subject.name }
    });

    return ok({ id: subject.id, deleted: true });
  } catch (err) {
    return handleApiError(SCOPE, err);
  }
}
