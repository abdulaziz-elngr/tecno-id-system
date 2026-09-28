"use client";

import { useEffect, useMemo, useState, type FormEvent, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { apiPost, useApi } from "@/lib/client";
import { Badge, ErrorNotice, Field, Modal, PageHeader, useToast } from "@/components/ui";

interface StudentRow {
  id: string;
  studentCode: string;
  fullName: string;
  status: string;
  phone: string | null;
  branch: { id: string; name: string };
  stage: { id: string; name: string } | null;
  grade: { id: string; name: string } | null;
  group: { id: string; name: string } | null;
  parents: { parent: { fullName: string; phone: string } }[];
}

interface ListResponse {
  data: StudentRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

interface StageOption {
  id: string;
  name: string;
  isActive: boolean;
  grades: { id: string; name: string; isActive: boolean }[];
}

interface GroupOption {
  id: string;
  name: string;
  gradeId: string;
  capacity: number;
  currentCount: number;
  isFull: boolean;
}

function StudentsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const searchParams = useSearchParams();
  const presetGroupId = searchParams.get("groupId");

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const { data: stages } = useApi<StageOption[]>("/api/stages");
  const { data: groups } = useApi<GroupOption[]>("/api/groups");

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    gender: "MALE",
    phone: "",
    parentName: "",
    parentPhone: "",
    address: "",
    school: "",
    notes: "",
    stageId: "",
    gradeId: "",
    groupId: presetGroupId ?? ""
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [capacityBlock, setCapacityBlock] = useState<{ capacity: number; currentCount: number } | null>(null);

  useEffect(() => {
    if (presetGroupId) {
      const g = groups?.find((g) => g.id === presetGroupId);
      setForm((f) => ({ ...f, groupId: presetGroupId, gradeId: g?.gradeId ?? f.gradeId }));
      setCreateOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetGroupId, groups]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (search.trim()) params.set("search", search.trim());

    const controller = new AbortController();
    fetch(`/api/students?${params.toString()}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? "Failed to load students.");
        }
        return r.json();
      })
      .then(setResult)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [search, page]);

  const selectedStage = useMemo(() => stages?.find((s) => s.id === form.stageId), [stages, form.stageId]);
  const gradesForStage = selectedStage?.grades.filter((g) => g.isActive) ?? [];
  const groupsForGrade = useMemo(
    () => (groups ?? []).filter((g) => g.gradeId === form.gradeId),
    [groups, form.gradeId]
  );
  const selectedGroup = groups?.find((g) => g.id === form.groupId);

  async function handleCreate(event: FormEvent, overrideCapacity = false) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setCapacityBlock(null);
    try {
      const branches = await fetch("/api/branches").then((r) => r.json()).catch(() => null);
      const branchId = branches?.data?.[0]?.id;
      await apiPost("/api/students", {
        branchId,
        groupId: form.groupId,
        fullName: form.fullName.trim(),
        gender: form.gender,
        phone: form.phone || undefined,
        parentName: form.parentName || undefined,
        parentPhone: form.parentPhone || undefined,
        address: form.address || undefined,
        school: form.school || undefined,
        notes: form.notes || undefined,
        overrideCapacity
      });
      toast.success(t("common.created"));
      setCreateOpen(false);
      setForm({
        fullName: "",
        gender: "MALE",
        phone: "",
        parentName: "",
        parentPhone: "",
        address: "",
        school: "",
        notes: "",
        stageId: "",
        gradeId: "",
        groupId: ""
      });
      setPage(1);
      setSearch((s) => s);
      window.location.reload();
    } catch (err: any) {
      if (err?.details?.code === "CAPACITY_FULL") {
        setCapacityBlock({
          capacity: err.details.capacity ?? selectedGroup?.capacity ?? 0,
          currentCount: err.details.currentCount ?? selectedGroup?.currentCount ?? 0
        });
      }
      setFormError(err instanceof Error ? err.message : "Failed to create student.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={t("students.title")}
        actions={
          <button className="btn-primary" onClick={() => setCreateOpen(true)}>
            {t("students.add")}
          </button>
        }
      />

      <input
        className="input mb-4 max-w-sm"
        placeholder={t("students.search")}
        value={search}
        onChange={(e) => {
          setPage(1);
          setSearch(e.target.value);
        }}
      />

      <ErrorNotice message={error} />

      <div className="card overflow-x-auto">
        <table className="w-full text-start text-sm">
          <thead className="border-b border-black/5 text-black/60 dark:border-white/10 dark:text-white/60">
            <tr>
              <th className="p-3 text-start">{t("students.id")}</th>
              <th className="p-3 text-start">{t("students.title")}</th>
              <th className="p-3 text-start">{t("nav.stages")}</th>
              <th className="p-3 text-start">{t("grades.title")}</th>
              <th className="p-3 text-start">{t("nav.groups")}</th>
              <th className="p-3 text-start">Phone</th>
              <th className="p-3 text-start">{t("common.status")}</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-black/5 dark:border-white/5">
                  <td className="p-3" colSpan={7}>
                    <span className="block h-4 w-full animate-pulse rounded bg-black/10 dark:bg-white/10" />
                  </td>
                </tr>
              ))}

            {!loading && result?.data.length === 0 && (
              <tr>
                <td className="p-6 text-center text-black/50 dark:text-white/50" colSpan={7}>
                  {t("students.empty")}
                </td>
              </tr>
            )}

            {!loading &&
              result?.data.map((s) => (
                <tr
                  key={s.id}
                  className="cursor-pointer border-b border-black/5 hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.02]"
                >
                  <td className="p-3 font-mono text-xs">
                    <Link href={`/dashboard/students/${s.id}`} className="hover:underline">
                      {s.studentCode}
                    </Link>
                  </td>
                  <td className="p-3 font-medium">
                    <Link href={`/dashboard/students/${s.id}`} className="hover:underline">
                      {s.fullName}
                    </Link>
                  </td>
                  <td className="p-3">{s.stage?.name ?? "—"}</td>
                  <td className="p-3">{s.grade?.name ?? "—"}</td>
                  <td className="p-3">{s.group?.name ?? "—"}</td>
                  <td className="p-3">{s.phone ?? s.parents[0]?.parent.phone ?? "—"}</td>
                  <td className="p-3">
                    <Badge tone={s.status === "ACTIVE" ? "success" : "neutral"}>{s.status}</Badge>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {result && result.pagination.totalPages > 1 && (
        <div className="mt-4 flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-black/10 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-white/10"
          >
            ‹
          </button>
          <span className="text-sm">
            {result.pagination.page} / {result.pagination.totalPages}
          </span>
          <button
            disabled={page >= result.pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-black/10 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-white/10"
          >
            ›
          </button>
        </div>
      )}

      <Modal open={createOpen} title={t("students.add")} onClose={() => setCreateOpen(false)}>
        <form onSubmit={(e) => handleCreate(e, false)} className="space-y-3">
          <ErrorNotice message={formError} />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" required>
              {(id) => (
                <input
                  id={id}
                  className="input"
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                  required
                />
              )}
            </Field>
            <Field label="Gender" required>
              {(id) => (
                <select
                  id={id}
                  className="input"
                  value={form.gender}
                  onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                >
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              )}
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("nav.stages")} required>
              {(id) => (
                <select
                  id={id}
                  className="input"
                  value={form.stageId}
                  onChange={(e) => setForm((f) => ({ ...f, stageId: e.target.value, gradeId: "", groupId: "" }))}
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
                <select
                  id={id}
                  className="input"
                  value={form.gradeId}
                  onChange={(e) => setForm((f) => ({ ...f, gradeId: e.target.value, groupId: "" }))}
                  required
                  disabled={!form.stageId}
                >
                  <option value="" disabled>
                    {t("common.select")}
                  </option>
                  {gradesForStage.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t("nav.groups")} required>
              {(id) => (
                <select
                  id={id}
                  className="input"
                  value={form.groupId}
                  onChange={(e) => setForm((f) => ({ ...f, groupId: e.target.value }))}
                  required
                  disabled={!form.gradeId}
                >
                  <option value="" disabled>
                    {t("common.select")}
                  </option>
                  {groupsForGrade.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.currentCount}/{g.capacity}
                      {g.isFull ? " · FULL" : ""})
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Parent/Guardian name">
              {(id) => (
                <input
                  id={id}
                  className="input"
                  value={form.parentName}
                  onChange={(e) => setForm((f) => ({ ...f, parentName: e.target.value }))}
                />
              )}
            </Field>
            <Field label="Parent/Guardian phone">
              {(id) => (
                <input
                  id={id}
                  className="input"
                  value={form.parentPhone}
                  onChange={(e) => setForm((f) => ({ ...f, parentPhone: e.target.value }))}
                />
              )}
            </Field>
            <Field label="Student phone">
              {(id) => (
                <input
                  id={id}
                  className="input"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              )}
            </Field>
            <Field label="Address">
              {(id) => (
                <input
                  id={id}
                  className="input"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              )}
            </Field>
          </div>

          <Field label={t("common.notes")}>
            {(id) => (
              <textarea
                id={id}
                className="input"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            )}
          </Field>

          {capacityBlock && (
            <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
              <p className="mb-2">
                This group is full ({capacityBlock.currentCount}/{capacityBlock.capacity}). An administrator can
                override this restriction to enroll anyway.
              </p>
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={(e) => handleCreate(e as unknown as FormEvent, true)}
                disabled={submitting}
              >
                Override and enroll anyway
              </button>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || !form.fullName.trim() || !form.groupId}>
              {submitting ? t("common.loading") : t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function StudentsPageWrapper() {
  return (
    <Suspense fallback={null}>
      <StudentsPage />
    </Suspense>
  );
}
