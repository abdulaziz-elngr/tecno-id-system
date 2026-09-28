"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n";
import { apiPost, useApi } from "@/lib/client";
import { Badge, ErrorNotice, Field, Modal, PageHeader, useToast } from "@/components/ui";

interface StageOption {
  id: string;
  name: string;
  isActive: boolean;
  grades: { id: string; name: string; isActive: boolean }[];
}

interface TeacherOption {
  id: string;
  fullName: string;
}

interface GroupRow {
  id: string;
  name: string;
  capacity: number;
  currentCount: number;
  remaining: number;
  capacityPercent: number;
  isFull: boolean;
  isActive: boolean;
  grade: { id: string; name: string; stage: { id: string; name: string } };
  teacher: { id: string; fullName: string } | null;
  schedules: { dayOfWeek: string; startMinutes: number; endMinutes: number }[];
}

function formatTime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Groups Management (spec §3, §16, §28): the Stage -> Grade -> Group
 * tree, each group's weekly schedule, and a live capacity indicator.
 * Creating a group always requires picking Stage then Grade — a group
 * can never be created against a Stage directly (spec §2).
 */
export default function GroupsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const { data: groups, loading, error, reload } = useApi<GroupRow[]>("/api/groups");
  const { data: stages } = useApi<StageOption[]>("/api/stages");
  const { data: teachers } = useApi<TeacherOption[]>("/api/teachers");

  const [createOpen, setCreateOpen] = useState(false);
  const [stageId, setStageId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState(20);
  const [teacherId, setTeacherId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedStage = useMemo(() => (stages ?? []).find((s) => s.id === stageId), [stages, stageId]);

  // Group by Stage -> Grade for the tree view (spec §3 example).
  const tree = useMemo(() => {
    const byStage = new Map<string, { name: string; grades: Map<string, { name: string; groups: GroupRow[] }> }>();
    for (const g of groups ?? []) {
      const stageKey = g.grade.stage.id;
      if (!byStage.has(stageKey)) byStage.set(stageKey, { name: g.grade.stage.name, grades: new Map() });
      const stageEntry = byStage.get(stageKey)!;
      if (!stageEntry.grades.has(g.grade.id)) stageEntry.grades.set(g.grade.id, { name: g.grade.name, groups: [] });
      stageEntry.grades.get(g.grade.id)!.groups.push(g);
    }
    return byStage;
  }, [groups]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      // branchId: single-branch demo assumption — a branch picker would
      // be added here for multi-branch organizations.
      const branches = await fetch("/api/branches").then((r) => r.json()).catch(() => null);
      const branchId = branches?.data?.[0]?.id;
      if (!branchId) throw new Error("No branch available for this account.");
      await apiPost("/api/groups", {
        branchId,
        gradeId,
        name: name.trim(),
        capacity,
        teacherId: teacherId || undefined,
        notes: notes.trim() || undefined
      });
      toast.success(t("common.created"));
      setCreateOpen(false);
      setName("");
      setCapacity(20);
      setTeacherId("");
      setNotes("");
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create group.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("nav.groups")}
        actions={
          <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
            {t("groups.add")}
          </button>
        }
      />

      <ErrorNotice message={error} />

      {loading && <p className="text-sm text-black/50 dark:text-white/50">{t("common.loading")}</p>}

      {!loading && (groups?.length ?? 0) === 0 && (
        <div className="card p-6 text-sm text-black/60 dark:text-white/60">
          {t("groups.empty")}
        </div>
      )}

      <div className="space-y-6">
        {Array.from(tree.entries()).map(([stageIdKey, stage]) => (
          <div key={stageIdKey} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
              {stage.name}
            </h2>
            {Array.from(stage.grades.entries()).map(([gId, grade]) => (
              <div key={gId} className="card p-4">
                <h3 className="mb-3 font-medium">{grade.name}</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {grade.groups.map((g) => (
                    <Link
                      key={g.id}
                      href={`/dashboard/academic/groups/${g.id}`}
                      className="block rounded-xl border border-black/10 p-3 transition hover:border-tecno-gold dark:border-white/10"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{g.name}</span>
                        {g.isFull ? (
                          <Badge tone="danger">{t("groups.full")}</Badge>
                        ) : (
                          <Badge tone={g.isActive ? "success" : "neutral"}>
                            {g.isActive ? t("common.active") : t("common.inactive")}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                        {g.teacher?.fullName ?? "—"}
                      </p>
                      <div className="mt-2">
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span>
                            {g.currentCount} / {g.capacity}
                          </span>
                          <span className="text-black/50 dark:text-white/50">{g.capacityPercent}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                          <div
                            className={`h-full rounded-full ${g.isFull ? "bg-red-500" : "bg-tecno-gold"}`}
                            style={{ width: `${Math.min(100, g.capacityPercent)}%` }}
                          />
                        </div>
                      </div>
                      {g.schedules.length > 0 && (
                        <p className="mt-2 text-xs text-black/50 dark:text-white/50">
                          {g.schedules
                            .map((s) => `${s.dayOfWeek} ${formatTime(s.startMinutes)}–${formatTime(s.endMinutes)}`)
                            .join(" · ")}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <Modal open={createOpen} title={t("groups.add")} onClose={() => setCreateOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-3">
          <ErrorNotice message={formError} />
          <Field label={t("nav.stages")} required>
            {(id) => (
              <select
                id={id}
                className="input"
                value={stageId}
                onChange={(e) => {
                  setStageId(e.target.value);
                  setGradeId("");
                }}
                required
              >
                <option value="" disabled>
                  {t("common.select")}
                </option>
                {(stages ?? [])
                  .filter((s) => s.isActive)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            )}
          </Field>
          <Field label={t("grades.title")} required>
            {(id) => (
              <select id={id} className="input" value={gradeId} onChange={(e) => setGradeId(e.target.value)} required disabled={!stageId}>
                <option value="" disabled>
                  {t("common.select")}
                </option>
                {(selectedStage?.grades ?? [])
                  .filter((g) => g.isActive)
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
              </select>
            )}
          </Field>
          <Field label="Group name" required>
            {(id) => (
              <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            )}
          </Field>
          <Field label="Capacity" required>
            {(id) => (
              <input
                id={id}
                type="number"
                min={1}
                className="input"
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                required
              />
            )}
          </Field>
          <Field label="Teacher">
            {(id) => (
              <select id={id} className="input" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="">—</option>
                {(teachers ?? []).map((t2) => (
                  <option key={t2.id} value={t2.id}>
                    {t2.fullName}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t("common.notes")}>
            {(id) => (
              <textarea id={id} className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            )}
          </Field>
          <p className="text-xs text-black/50 dark:text-white/50">
            Add the weekly schedule from the group's detail page after creating it.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || !name.trim() || !gradeId}>
              {submitting ? t("common.loading") : t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
