"use client";

import { useEffect, useState, type FormEvent } from "react";

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
type Day = (typeof DAYS)[number];

interface GroupOption {
  id: string;
  name: string;
  grade: { name: string; stage: { name: string } };
  teacher: { id: string; fullName: string } | null;
}

interface ScheduleRow {
  id: string;
  groupId: string;
  dayOfWeek: Day;
  startTime: string;
  endTime: string;
  group: {
    id: string;
    name: string;
    grade: { name: string; stage: { name: string } };
    teacher: { fullName: string } | null;
    assistant: { fullName: string } | null;
  };
}

export default function SchedulePage() {
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<{ type: string; conflictingGroup: string }[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [groupId, setGroupId] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState<Day>("SUNDAY");
  const [startTime, setStartTime] = useState("16:00");
  const [endTime, setEndTime] = useState("17:30");

  function loadSchedules() {
    return fetch("/api/schedules")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Failed to load schedules.");
        return r.json();
      })
      .then((body) => setSchedules(body.data));
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/groups").then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Failed to load groups.");
        return r.json();
      }),
      loadSchedules()
    ])
      .then(([groupsBody]) => {
        setGroups(groupsBody.data);
        if (groupsBody.data[0]) setGroupId(groupsBody.data[0].id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setConflicts(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, dayOfWeek, startTime, endTime })
      });
      const body = await res.json();

      if (!res.ok) {
        if (res.status === 409 && body.conflicts) {
          setConflicts(body.conflicts);
        }
        setError(body.error ?? "Failed to create schedule.");
        return;
      }

      await loadSchedules();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/schedules/${id}`, { method: "DELETE" });
    await loadSchedules();
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Schedule</h1>

      <form onSubmit={handleSubmit} className="card mb-6 grid gap-3 p-4 sm:grid-cols-5">
        <select className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.grade.stage.name} · {g.grade.name} · {g.name}
            </option>
          ))}
        </select>
        <select className="input" value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value as Day)}>
          {DAYS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <input
          type="time"
          className="input"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />
        <input type="time" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        <button type="submit" disabled={submitting || !groupId} className="btn-primary">
          {submitting ? "Checking..." : "Add slot"}
        </button>
      </form>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <p>{error}</p>
          {conflicts && (
            <ul className="mt-1 list-inside list-disc">
              {conflicts.map((c, i) => (
                <li key={i}>
                  {c.type} conflict with group "{c.conflictingGroup}"
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-start text-sm">
          <thead className="border-b border-black/5 text-black/60 dark:border-white/10 dark:text-white/60">
            <tr>
              <th className="p-3 text-start">Day</th>
              <th className="p-3 text-start">Time</th>
              <th className="p-3 text-start">Group</th>
              <th className="p-3 text-start">Grade</th>
              <th className="p-3 text-start">Teacher</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-black/5 dark:border-white/5">
                  <td className="p-3" colSpan={6}>
                    <span className="block h-4 w-full animate-pulse rounded bg-black/10 dark:bg-white/10" />
                  </td>
                </tr>
              ))}

            {!loading && schedules.length === 0 && (
              <tr>
                <td className="p-6 text-center text-black/50 dark:text-white/50" colSpan={6}>
                  No schedule slots yet.
                </td>
              </tr>
            )}

            {!loading &&
              schedules.map((s) => (
                <tr key={s.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="p-3">{s.dayOfWeek}</td>
                  <td className="p-3">
                    {s.startTime}–{s.endTime}
                  </td>
                  <td className="p-3 font-medium">{s.group.name}</td>
                  <td className="p-3">{s.group.grade.name}</td>
                  <td className="p-3">{s.group.teacher?.fullName ?? "—"}</td>
                  <td className="p-3">
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="text-xs text-red-600 hover:underline dark:text-red-400"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
