import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Banner,
  Badge,
  Button,
  EmptyState,
  Field,
  PageHeader,
  SearchInput,
} from "@/components/ui";
import { api } from "@/services/api/client";
import { currentMembership } from "@/services/auth";
import { canManageOperational } from "@/utils/roleAccess";
import { educationSegmentPath } from "@/utils/routes";
import { results } from "@/utils/format";
import { isSameLocalDay } from "./resepshen_yagona/utils";
import RoomDetailPanel from "./RoomDetailPanel";

const emptyForm = { name: "", capacity: "12", is_active: true };

const LIST_FILTERS = [
  ["all", "Все"],
  ["active", "Активные"],
  ["busy", "Заняты сегодня"],
  ["inactive", "Архив"],
];

async function asList(path) {
  return results(await api.get(path));
}

async function optionalList(path) {
  try {
    return await asList(path);
  } catch {
    return [];
  }
}

function roomMonogram(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(name || "?").slice(0, 2).toUpperCase();
}

function RoomListItem({ room, selected, onSelect }) {
  const busyToday = room.today_count > 0;
  return (
    <li className={selected ? "is-selected" : ""}>
      <button type="button" className="rooms-list-btn" onClick={() => onSelect(room)}>
        <span className="rooms-list-mark" aria-hidden="true">
          {roomMonogram(room.name)}
        </span>
        <div className="rooms-list-main">
          <div className="rooms-list-title-row">
            <strong>{room.name}</strong>
            {busyToday ? <span className="rooms-live-dot" title="Есть занятия сегодня" /> : null}
          </div>
          <p className="muted">
            {room.capacity || "—"} мест
            {room.today_count ? ` · ${room.today_count} сегодня` : ""}
            {room.rules_count ? ` · ${room.rules_count}/нед.` : ""}
          </p>
        </div>
        <Badge
          value={room.is_active !== false ? "active" : "inactive"}
          label={room.is_active !== false ? "активен" : "архив"}
        />
      </button>
    </li>
  );
}

export default function RoomsPage() {
  const { tenantSlug = "" } = useParams();
  const canWrite = canManageOperational(currentMembership()?.role || "");

  const [rooms, setRooms] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [rules, setRules] = useState([]);
  const [groups, setGroups] = useState([]);
  const [courses, setCourses] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [query, setQuery] = useState("");
  const [listFilter, setListFilter] = useState("active");
  const [selectedId, setSelectedId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [roomData, lessonData, ruleData, groupData, courseData, staffData] = await Promise.all([
        asList("/rooms?page_size=200"),
        asList("/lessons?page_size=500&ordering=starts_at"),
        optionalList("/schedule-rules?page_size=300"),
        optionalList("/groups?page_size=200"),
        optionalList("/courses?page_size=100"),
        optionalList("/staff?page_size=200"),
      ]);
      setRooms(roomData);
      setLessons(lessonData);
      setRules(ruleData);
      setGroups(groupData);
      setCourses(courseData);
      setStaff(staffData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const groupMap = useMemo(
    () => Object.fromEntries(groups.map((g) => [String(g.id), g])),
    [groups],
  );
  const courseMap = useMemo(
    () => Object.fromEntries(courses.map((c) => [String(c.id), c])),
    [courses],
  );
  const staffMap = useMemo(
    () => Object.fromEntries(staff.map((s) => [String(s.id), s])),
    [staff],
  );

  const enriched = useMemo(() => {
    const now = Date.now();
    return rooms.map((room) => {
      const roomLessons = lessons.filter(
        (l) => String(l.room) === String(room.id) && l.status !== "cancelled",
      );
      const roomRules = rules.filter(
        (r) => String(r.room) === String(room.id) && r.is_active !== false,
      );
      const todayLessons = roomLessons.filter((l) => isSameLocalDay(l.starts_at));
      const upcoming = roomLessons.filter((l) => new Date(l.starts_at).getTime() >= now - 3600000);
      return {
        ...room,
        lessons_total: roomLessons.length,
        today_count: todayLessons.length,
        upcoming_count: upcoming.length,
        rules_count: roomRules.length,
      };
    });
  }, [rooms, lessons, rules]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched
      .filter((row) => {
        if (listFilter === "active" && row.is_active === false) return false;
        if (listFilter === "inactive" && row.is_active !== false) return false;
        if (listFilter === "busy" && !row.today_count) return false;
        if (!q) return true;
        return String(row.name || "").toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (b.today_count !== a.today_count) return b.today_count - a.today_count;
        return String(a.name).localeCompare(String(b.name), "ru");
      });
  }, [enriched, query, listFilter]);

  const selected = useMemo(
    () => enriched.find((r) => String(r.id) === String(selectedId)) || null,
    [enriched, selectedId],
  );

  const selectedRules = useMemo(
    () => (selected ? rules.filter((r) => String(r.room) === String(selected.id)) : []),
    [rules, selected],
  );

  const selectedLessons = useMemo(
    () => (selected ? lessons.filter((l) => String(l.room) === String(selected.id)) : []),
    [lessons, selected],
  );

  useEffect(() => {
    if (selectedId && !selected) setSelectedId("");
  }, [selectedId, selected]);

  useEffect(() => {
    if (loading || selectedId || !filtered.length) return;
    setSelectedId(String(filtered[0].id));
  }, [loading, selectedId, filtered]);

  const stats = useMemo(() => {
    const active = enriched.filter((r) => r.is_active !== false);
    const busyToday = enriched.filter((r) => r.today_count > 0);
    return {
      total: enriched.length,
      active: active.length,
      capacity: active.reduce((sum, r) => sum + Number(r.capacity || 0), 0),
      busyToday: busyToday.length,
    };
  }, [enriched]);

  function openCreate() {
    setEditId("");
    setForm(emptyForm);
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(room) {
    setEditId(String(room.id));
    setForm({
      name: room.name || "",
      capacity: String(room.capacity || ""),
      is_active: room.is_active !== false,
    });
    setFormError("");
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditId("");
    setForm(emptyForm);
    setFormError("");
  }

  async function submitForm(event) {
    event.preventDefault();
    setFormError("");
    const name = form.name.trim();
    const capacity = Number(form.capacity);
    if (!name) {
      setFormError("Укажите название кабинета.");
      return;
    }
    if (!Number.isFinite(capacity) || capacity < 1) {
      setFormError("Вместимость должна быть не меньше 1.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name,
        capacity: Math.floor(capacity),
        is_active: Boolean(form.is_active),
      };
      if (editId) {
        await api.patch(`/rooms/${editId}`, payload);
        setInfo(`Кабинет «${name}» обновлён`);
      } else {
        const created = await api.post("/rooms", payload);
        setInfo(`Кабинет «${name}» добавлен`);
        if (created?.id) setSelectedId(String(created.id));
      }
      closeForm();
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const schedulePath = educationSegmentPath(tenantSlug, "schedule");

  return (
    <div className="reception-page rooms-page">
      <PageHeader
        title="Кабинеты"
        subtitle="Занятость, расписание по дням и ближайшие уроки"
        actions={
          <>
            <Button type="button" variant="ghost" onClick={load} disabled={loading || busy}>
              Обновить
            </Button>
            {canWrite ? (
              <Button type="button" onClick={openCreate}>
                + Добавить кабинет
              </Button>
            ) : null}
          </>
        }
      />

      {error ? <Banner>{error}</Banner> : null}
      {info ? <Banner tone="ok">{info}</Banner> : null}

      <div className="rooms-stats">
        <div className="rooms-stat">
          <span className="rooms-stat-label">Кабинетов</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="rooms-stat">
          <span className="rooms-stat-label">Активных</span>
          <strong>{stats.active}</strong>
        </div>
        <div className={`rooms-stat${stats.busyToday ? " is-live" : ""}`}>
          <span className="rooms-stat-label">Заняты сегодня</span>
          <strong>
            {stats.busyToday}
            <small> / {stats.active}</small>
          </strong>
        </div>
        <div className="rooms-stat">
          <span className="rooms-stat-label">Мест всего</span>
          <strong>{stats.capacity}</strong>
        </div>
      </div>

      <div className="reception-layout rooms-layout">
        <div className="reception-main">
          <section className="reception-panel rooms-list-panel">
            <div className="reception-panel-head">
              <div>
                <h2>Список</h2>
                <p className="muted reception-panel-sub">{filtered.length} кабинетов</p>
              </div>
              <Link to={schedulePath}>Расписание</Link>
            </div>

            <div className="rooms-toolbar">
              <Field label="Поиск">
                <SearchInput value={query} onChange={setQuery} placeholder="A-101, Зал, Online…" />
              </Field>
              <div className="rooms-filters" role="tablist" aria-label="Фильтр кабинетов">
                {LIST_FILTERS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={listFilter === value}
                    className={listFilter === value ? "is-active" : ""}
                    onClick={() => setListFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <p className="muted rooms-loading">Загрузка…</p>
            ) : !filtered.length ? (
              <EmptyState
                title="Кабинетов не найдено"
                body="Измените фильтр или добавьте новый кабинет."
                action={
                  canWrite ? (
                    <Button type="button" onClick={openCreate}>
                      + Добавить кабинет
                    </Button>
                  ) : null
                }
              />
            ) : (
              <ul className="reception-list rooms-list">
                {filtered.map((room) => (
                  <RoomListItem
                    key={room.id}
                    room={room}
                    selected={String(room.id) === String(selectedId)}
                    onSelect={(row) => setSelectedId(String(row.id))}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="reception-side">
          <RoomDetailPanel
            room={selected}
            rules={selectedRules}
            lessons={selectedLessons}
            groupMap={groupMap}
            courseMap={courseMap}
            staffMap={staffMap}
            schedulePath={schedulePath}
            canWrite={canWrite}
            onEdit={openEdit}
          />
        </aside>
      </div>

      {formOpen ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Кабинет">
          <button type="button" className="overlay-backdrop" aria-label="Закрыть" onClick={closeForm} />
          <form className="sheet reception-sheet" onSubmit={submitForm}>
            <div className="sheet-head">
              <div>
                <h2>{editId ? "Редактировать кабинет" : "Добавить кабинет"}</h2>
                <p className="muted">Название и вместимость для расписания</p>
              </div>
              <button type="button" className="sheet-close" onClick={closeForm} aria-label="Закрыть">
                ×
              </button>
            </div>
            <div className="sheet-body">
              {formError ? <p className="field-message error">{formError}</p> : null}
              <div className="form-grid">
                <Field label="Название *" className="span-2">
                  <input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="A-101, Зал 1, Online"
                    required
                    autoFocus
                  />
                </Field>
                <Field label="Вместимость *">
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={form.capacity}
                    onChange={(e) => setForm((p) => ({ ...p, capacity: e.target.value }))}
                    required
                  />
                </Field>
                <Field label="Статус">
                  <select
                    value={form.is_active ? "active" : "inactive"}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, is_active: e.target.value === "active" }))
                    }
                  >
                    <option value="active">Активен</option>
                    <option value="inactive">Архив</option>
                  </select>
                </Field>
              </div>
            </div>
            <div className="sheet-foot">
              <Button type="button" variant="ghost" onClick={closeForm}>
                Отмена
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Сохранение…" : editId ? "Сохранить" : "Добавить"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
