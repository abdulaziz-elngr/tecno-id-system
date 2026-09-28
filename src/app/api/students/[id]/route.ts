import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, ForbiddenError, UnauthorizedError } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

const updateStudentSchema = z.object({
  fullName: z.string().trim().min(2).max(200).optional(),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(500).optional(),
  school: z.string().trim().max(200).optional(),
  groupId: z.string().uuid().optional(),
  notes: z.string().trim().max(2000).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED", "GRADUATED"]).optional(),
  emergencyContact: z.string().trim().max(200).optional(),
  overrideCapacity: z.boolean().optional()
});

function handleKnownErrors(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  console.error("[students/:id] internal error", err);
  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 }
  );
}

async function findScopedStudent(organizationId: string, branchIds: string[] | undefined, id: string) {
  return db.student.findFirst({
    where: {
      id,
      organizationId,
      deletedAt: null,
      ...(branchIds ? { branchId: { in: branchIds } } : {})
    }
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await requirePermission("students.view");
    const branchIds = ctx.isOrgWide ? undefined : ctx.branchIds;

    const student = await findScopedStudent(ctx.organizationId, branchIds, params.id);
    if (!student) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    return NextResponse.json({ data: student });
  } catch (err) {
    return handleKnownErrors(err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await requirePermission("students.update");
    const branchIds = ctx.isOrgWide ? undefined : ctx.branchIds;

    const existing = await findScopedStudent(ctx.organizationId, branchIds, params.id);
    if (!existing) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const parsed = updateStudentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid student data.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { overrideCapacity, groupId, ...rest } = parsed.data;

    let groupUpdate: { groupId: string; gradeId: string; stageId: string } | null = null;
    if (groupId && groupId !== existing.groupId) {
      // Transferring a student to another group: re-validate the full
      // Stage -> Grade -> Group chain and capacity, exactly like at
      // creation time — never trust the client's grade/stage.
      // The target group must be in THIS organization and in the student's
      // own branch (same invariant as creation) — a client-supplied groupId
      // is never trusted on its own.
      const group = await db.group.findFirst({
        where: {
          id: groupId,
          deletedAt: null,
          branchId: existing.branchId,
          branch: { center: { organizationId: ctx.organizationId } }
        },
        include: {
          grade: { include: { stage: true } },
          _count: { select: { students: { where: { deletedAt: null, status: "ACTIVE" } } } }
        }
      });
      if (!group) {
        return NextResponse.json({ error: "Invalid group." }, { status: 400 });
      }
      if (!group.isActive || !group.grade.isActive || !group.grade.stage.isActive) {
        return NextResponse.json({ error: "Cannot move into an inactive group/grade/stage." }, { status: 400 });
      }
      if (group._count.students >= group.capacity && !overrideCapacity) {
        return NextResponse.json(
          {
            error: "This group has reached its maximum capacity.",
            details: { code: "CAPACITY_FULL", capacity: group.capacity, currentCount: group._count.students }
          },
          { status: 409 }
        );
      }
      groupUpdate = { groupId: group.id, gradeId: group.gradeId, stageId: group.grade.stageId };
    }

    const updated = await db.student.update({
      where: { id: existing.id },
      data: { ...rest, ...(groupUpdate ?? {}) }
    });

    await writeAuditLog({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "UPDATE_STUDENT",
      entityType: "Student",
      entityId: updated.id,
      beforeValue: existing,
      afterValue: updated
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    return handleKnownErrors(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await requirePermission("students.delete");
    const branchIds = ctx.isOrgWide ? undefined : ctx.branchIds;

    const existing = await findScopedStudent(ctx.organizationId, branchIds, params.id);
    if (!existing) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const reason = z.object({ reason: z.string().trim().min(3).max(500) }).safeParse(body);
    if (!reason.success) {
      return NextResponse.json(
        { error: "A reason is required to delete a student record." },
        { status: 400 }
      );
    }

    // Soft delete only — student history (attendance, payments, grades
    // in later phases) must be preserved. See Rule 6 / §43.
    const deleted = await db.student.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), status: "INACTIVE" }
    });

    await writeAuditLog({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "DELETE_STUDENT",
      entityType: "Student",
      entityId: deleted.id,
      beforeValue: existing,
      afterValue: deleted,
      reason: reason.data.reason
    });

    return NextResponse.json({ data: deleted });
  } catch (err) {
    return handleKnownErrors(err);
  }
}
