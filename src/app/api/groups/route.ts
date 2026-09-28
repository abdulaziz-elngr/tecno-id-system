import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, resolveBranchScope, ForbiddenError, UnauthorizedError } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { isAssignableTeacher } from "@/lib/scope";

const listQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  gradeId: z.string().uuid().optional()
});

const createGroupSchema = z.object({
  branchId: z.string().uuid(),
  gradeId: z.string().uuid(),
  teacherId: z.string().uuid().optional(),
  assistantId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  capacity: z.number().int().min(1).max(2000),
  notes: z.string().trim().max(2000).optional()
});

function handleKnownErrors(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  console.error("[groups] internal error", err);
  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 }
  );
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePermission("academic.groups.manage");
    const url = new URL(request.url);
    const parsed = listQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters." }, { status: 400 });
    }
    const branchIds = resolveBranchScope(ctx, parsed.data.branchId);

    const groups = await db.group.findMany({
      where: {
        deletedAt: null,
        branch: { center: { organizationId: ctx.organizationId } },
        ...(branchIds ? { branchId: { in: branchIds } } : {}),
        ...(parsed.data.gradeId ? { gradeId: parsed.data.gradeId } : {}),
        ...(parsed.data.stageId ? { grade: { stageId: parsed.data.stageId } } : {})
      },
      orderBy: [{ grade: { stage: { order: "asc" } } }, { grade: { order: "asc" } }, { name: "asc" }],
      include: {
        grade: { select: { id: true, name: true, stage: { select: { id: true, name: true } } } },
        teacher: { select: { id: true, fullName: true } },
        assistant: { select: { id: true, fullName: true } },
        schedules: { where: { isActive: true }, orderBy: { dayOfWeek: "asc" } },
        _count: { select: { students: { where: { deletedAt: null, status: "ACTIVE" } } } }
      }
    });

    const data = groups.map((g) => ({
      ...g,
      currentCount: g._count.students,
      remaining: Math.max(0, g.capacity - g._count.students),
      capacityPercent: g.capacity > 0 ? Math.round((g._count.students / g.capacity) * 1000) / 10 : 0,
      isFull: g._count.students >= g.capacity
    }));

    return NextResponse.json({ data });
  } catch (err) {
    return handleKnownErrors(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePermission("academic.groups.manage");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    const parsed = createGroupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid group data.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const input = parsed.data;

    resolveBranchScope(ctx, input.branchId);
    const branch = await db.branch.findFirst({
      where: { id: input.branchId, deletedAt: null, center: { organizationId: ctx.organizationId } }
    });
    if (!branch) {
      return NextResponse.json({ error: "Invalid branch." }, { status: 400 });
    }

    // Enforce the Stage -> Grade -> Group hierarchy: the grade must be
    // a real, active grade that belongs to this organization.
    const grade = await db.grade.findFirst({
      where: { id: input.gradeId, stage: { organizationId: ctx.organizationId } },
      include: { stage: true }
    });
    if (!grade) {
      return NextResponse.json({ error: "Invalid grade." }, { status: 400 });
    }
    if (!grade.isActive || !grade.stage.isActive) {
      return NextResponse.json(
        { error: "Cannot create a group under an inactive stage/grade." },
        { status: 400 }
      );
    }

    // teacherId / assistantId come from the client: verify they belong to
    // this organization and to a branch the caller may manage.
    if (input.teacherId && !(await isAssignableTeacher(ctx, input.teacherId))) {
      return NextResponse.json({ error: "Invalid teacher." }, { status: 400 });
    }
    if (input.assistantId && !(await isAssignableTeacher(ctx, input.assistantId))) {
      return NextResponse.json({ error: "Invalid assistant." }, { status: 400 });
    }

    const group = await db.group.create({
      data: {
        branchId: input.branchId,
        gradeId: input.gradeId,
        teacherId: input.teacherId,
        assistantId: input.assistantId,
        name: input.name,
        capacity: input.capacity,
        notes: input.notes
      }
    });

    await writeAuditLog({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "CREATE_GROUP",
      entityType: "Group",
      entityId: group.id,
      afterValue: group
    });

    return NextResponse.json({ data: group }, { status: 201 });
  } catch (err) {
    return handleKnownErrors(err);
  }
}
