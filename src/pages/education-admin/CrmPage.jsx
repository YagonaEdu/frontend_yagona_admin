import { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Banner,
  Badge,
  Button,
  DataTable,
  Field,
  PageHeader,
  TextAction,
} from "@/components/ui";
import { api } from "@/services/api/client";
import { currentMembership } from "@/services/auth";
import {
  formatDate,
  formatWhen,
  formatUzPhone,
  looksLikeEmail,
  results,
} from "@/utils/format";

const SOURCE_LABELS = {
  manual: "Вручную",
  website: "Сайт",
  telegram: "Telegram",
  instagram: "Instagram",
  other: "Другое",
};

const ACTIVITY_KIND_LABELS = {
  call: "Звонок",
  message: "Сообщение",
  note: "Заметка",
  stage_change: "Смена стадии",
};

const STAGE_TONES = ["tone-a", "tone-b", "tone-c", "tone-d", "tone-e", "tone-f"];

const emptyForm = {
  full_name: "",
  phone: "",
  email: "",
  source: "manual",
  source_details: "",
  stage: "",
  notes: "",
  next_follow_up_at: "",
};

function toLocalInput(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function fromLocalInput(value) {
  if (!value) return null;
  return new Date(value).toISOString();
}

function isFollowUpOverdue(lead) {
  if (!lead?.next_follow_up_at || lead.converted_student) return false;
  return new Date(lead.next_follow_up_at) < new Date();
}

function isFollowUpToday(lead) {
  if (!lead?.next_follow_up_at || lead.converted_student) return false;
  const due = new Date(lead.next_follow_up_at);
  const now = new Date();
  return (
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate()
  );
}

function taskLabel(lead) {
  if (lead.converted_student) return { text: "Ученик", tone: "ok" };
  if (isFollowUpOverdue(lead)) return { text: "Просрочен контакт", tone: "warn" };
  if (isFollowUpToday(lead)) return { text: "Связаться сегодня", tone: "today" };
  if (lead.next_follow_up_at) return { text: formatDate(lead.next_follow_up_at), tone: "plan" };
  return { text: "Нет задач", tone: "idle" };
}

function stageTone(stage, index) {
  if (stage?.is_won) return "tone-won";
  if (stage?.is_lost) return "tone-lost";
  return STAGE_TONES[index % STAGE_TONES.length];
}

export default function CrmPage() {
  const canWrite = ["owner", "admin"].includes(currentMembership()?.role);
  const [leads, setLeads] = useState([]);
  const [stages, setStages] = useState([]);
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("board");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [followFilter, setFollowFilter] = useState("all");
  const [convertedFilter, setConvertedFilter] = useState("open");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [draggingId, setDraggingId] = useState("");
  const [dropStageId, setDropStageId] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [stageOpen, setStageOpen] = useState(false);
  const [stageForm, setStageForm] = useState({ name: "", kind: "open" });
  const [stageDelete, setStageDelete] = useState(null); // { stage, moveTo }
  const [leadDeleteAsk, setLeadDeleteAsk] = useState(false);

  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const [activities, setActivities] = useState([]);
  const [activityForm, setActivityForm] = useState({ kind: "note", content: "" });
  const [convertGroup, setConvertGroup] = useState("");

  async function load() {
    setError("");
    setLoading(true);
    try {
      const [leadData, stageData, groupData] = await Promise.all([
        api.get("/leads?page_size=200&ordering=-updated_at"),
        api.get("/lead-stages?page_size=100"),
        api.get("/groups?page_size=100").catch(() => ({ results: [] })),
      ]);
      const stageList = [...results(stageData)].sort(
        (a, b) => Number(a.position || 0) - Number(b.position || 0),
      );
      setLeads(results(leadData));
      setStages(stageList);
      setGroups(results(groupData));
      setForm((prev) => ({ ...prev, stage: prev.stage || stageList[0]?.id || "" }));
      setConvertGroup((prev) => prev || results(groupData)[0]?.id || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const stageMap = useMemo(() => {
    const map = new Map(stages.map((item) => [String(item.id), item]));
    return map;
  }, [stages]);

  function stageOf(lead) {
    return stageMap.get(String(lead.stage)) || null;
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((lead) => {
      if (convertedFilter === "open" && lead.converted_student) return false;
      if (convertedFilter === "converted" && !lead.converted_student) return false;
      if (sourceFilter && lead.source !== sourceFilter) return false;
      if (followFilter === "overdue" && !isFollowUpOverdue(lead)) return false;
      if (followFilter === "today" && !isFollowUpToday(lead)) return false;
      if (followFilter === "scheduled" && !lead.next_follow_up_at) return false;
      if (!q) return true;
      return [lead.full_name, lead.phone, lead.email, lead.notes, lead.source]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [leads, query, sourceFilter, followFilter, convertedFilter]);

  const openLeads = useMemo(
    () => leads.filter((lead) => !lead.converted_student),
    [leads],
  );
  const convertedCount = leads.length - openLeads.length;
  const overdueCount = openLeads.filter(isFollowUpOverdue).length;
  const conversionRate = leads.length
    ? Math.round((convertedCount / leads.length) * 1000) / 10
    : 0;

  const selected = useMemo(
    () => leads.find((lead) => String(lead.id) === String(selectedId)) || null,
    [leads, selectedId],
  );

  async function openLead(lead) {
    setError("");
    setInfo("");
    setLeadDeleteAsk(false);
    setSelectedId(lead.id);
    setDraft({
      full_name: lead.full_name || "",
      phone: lead.phone || "",
      email: lead.email || "",
      source: lead.source || "manual",
      source_details: lead.source_details || "",
      stage: lead.stage || "",
      notes: lead.notes || "",
      next_follow_up_at: toLocalInput(lead.next_follow_up_at),
      lost_reason: lead.lost_reason || "",
    });
    setActivityForm({ kind: "note", content: "" });
    try {
      const items = await api.get(`/leads/${lead.id}/activities`);
      setActivities(Array.isArray(items) ? items : results(items));
    } catch (err) {
      setActivities([]);
      setError(err.message);
    }
  }

  function closeLead() {
    setSelectedId("");
    setDraft(null);
    setActivities([]);
    setLeadDeleteAsk(false);
  }

  function openCreate(stageId = "") {
    setError("");
    setForm({
      ...emptyForm,
      stage: stageId || stages[0]?.id || "",
      phone: "",
    });
    setCreateOpen(true);
  }

  function openStageCreate() {
    setError("");
    setStageForm({ name: "", kind: "open" });
    setStageOpen(true);
  }

  async function createStage(event) {
    event.preventDefault();
    if (!canWrite) return;
    const name = stageForm.name.trim();
    if (!name) {
      setError("Укажите название категории.");
      return;
    }
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const maxPos = stages.reduce((max, row) => Math.max(max, Number(row.position || 0)), 0);
      await api.post("/lead-stages", {
        name,
        position: maxPos + 10,
        is_won: stageForm.kind === "won",
        is_lost: stageForm.kind === "lost",
      });
      setStageOpen(false);
      setInfo(`Категория «${name}» добавлена.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openStageDelete(stage) {
    if (!canWrite) return;
    if (stages.length <= 1) {
      setError("Нельзя удалить последнюю категорию воронки.");
      return;
    }
    const fallback = stages.find((row) => String(row.id) !== String(stage.id));
    setStageDelete({
      stage,
      moveTo: fallback?.id || "",
    });
  }

  async function confirmStageDelete(event) {
    event.preventDefault();
    if (!canWrite || !stageDelete?.stage) return;
    const stage = stageDelete.stage;
    const count = leads.filter((row) => String(row.stage) === String(stage.id)).length;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const query =
        count > 0 && stageDelete.moveTo
          ? `?move_to=${encodeURIComponent(stageDelete.moveTo)}`
          : "";
      await api.del(`/lead-stages/${stage.id}${query}`);
      setStageDelete(null);
      setInfo(`Категория «${stage.name}» удалена.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function askDeleteLead() {
    if (!canWrite || !selected) return;
    setLeadDeleteAsk(true);
  }

  async function confirmDeleteLead() {
    if (!canWrite || !selected) return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const name = selected.full_name;
      await api.del(`/leads/${selected.id}`);
      setLeadDeleteAsk(false);
      setInfo(`Сделка «${name}» удалена.`);
      closeLead();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createLead(event) {
    event.preventDefault();
    if (!canWrite) return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const payload = {
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || "",
        source: form.source,
        source_details: form.source_details.trim(),
        stage: form.stage,
        notes: form.notes.trim(),
        next_follow_up_at: fromLocalInput(form.next_follow_up_at),
      };
      const created = await api.post("/leads", payload);
      setCreateOpen(false);
      setInfo(`Сделка «${created.full_name || payload.full_name}» создана.`);
      await load();
      if (created?.id) openLead(created);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveLead(event) {
    event?.preventDefault?.();
    if (!canWrite || !selected || !draft) return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const updated = await api.patch(`/leads/${selected.id}`, {
        full_name: draft.full_name.trim(),
        phone: draft.phone.trim(),
        email: draft.email.trim() || "",
        source: draft.source,
        source_details: draft.source_details.trim(),
        stage: draft.stage,
        notes: draft.notes.trim(),
        next_follow_up_at: fromLocalInput(draft.next_follow_up_at),
        lost_reason: draft.lost_reason.trim(),
      });
      setInfo("Карточка сохранена.");
      setLeads((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setDraft((prev) => ({
        ...prev,
        next_follow_up_at: toLocalInput(updated.next_follow_up_at),
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function moveStage(lead, stageId) {
    if (!canWrite || !stageId || String(lead.stage) === String(stageId)) return;
    setError("");
    const previous = lead.stage;
    setLeads((prev) =>
      prev.map((row) => (row.id === lead.id ? { ...row, stage: stageId } : row)),
    );
    try {
      const updated = await api.patch(`/leads/${lead.id}`, { stage: stageId });
      setLeads((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      if (String(selectedId) === String(lead.id)) {
        setDraft((prev) => (prev ? { ...prev, stage: stageId } : prev));
      }
    } catch (err) {
      setLeads((prev) =>
        prev.map((row) => (row.id === lead.id ? { ...row, stage: previous } : row)),
      );
      setError(err.message);
    }
  }

  async function addActivity(event) {
    event.preventDefault();
    if (!canWrite || !selected || !activityForm.content.trim()) return;
    setBusy(true);
    setError("");
    try {
      const item = await api.post(`/leads/${selected.id}/activities`, {
        kind: activityForm.kind,
        content: activityForm.content.trim(),
      });
      setActivities((prev) => [item, ...prev]);
      setActivityForm({ kind: activityForm.kind, content: "" });
      setInfo("Активность добавлена.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function convertLead() {
    if (!canWrite || !selected || selected.converted_student) return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const body = convertGroup ? { group_id: convertGroup } : {};
      const student = await api.post(`/leads/${selected.id}/convert`, body);
      setInfo(`Сделка конвертирована в ученика «${student.full_name || ""}».`);
      await load();
      closeLead();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function exportExcel() {
    setExporting(true);
    setError("");
    try {
      const { downloadExcel, excelStamp } = await import("@/utils/exportExcel");
      downloadExcel(`yagona-crm_${excelStamp()}.xlsx`, filtered, [
        { key: "full_name", title: "ФИО" },
        { key: "phone", title: "Телефон" },
        { key: "email", title: "Email" },
        {
          key: "source",
          title: "Источник",
          value: (row) => SOURCE_LABELS[row.source] || row.source || "",
        },
        {
          key: "stage",
          title: "Стадия",
          value: (row) => stageOf(row)?.name || "",
        },
        {
          key: "next_follow_up_at",
          title: "След. контакт",
          value: (row) => (row.next_follow_up_at ? formatWhen(row.next_follow_up_at) : ""),
        },
        {
          key: "converted",
          title: "Конвертирован",
          value: (row) => (row.converted_student ? "да" : "нет"),
        },
        { key: "notes", title: "Заметки", value: (row) => row.notes || "" },
      ]);
    } catch (err) {
      setError(err.message || "Не удалось скачать Excel");
    } finally {
      setExporting(false);
    }
  }

  function onPhoneChange(value, setter) {
    if (!value) {
      setter("");
      return;
    }
    if (looksLikeEmail(value)) {
      setter(value);
      return;
    }
    setter(formatUzPhone(value));
  }

  function onDragStart(event, lead) {
    if (!canWrite || lead.converted_student) {
      event.preventDefault();
      return;
    }
    setDraggingId(lead.id);
    event.dataTransfer.setData("text/plain", String(lead.id));
    event.dataTransfer.effectAllowed = "move";
  }

  function onDragEnd() {
    setDraggingId("");
    setDropStageId("");
  }

  function onColumnDragOver(event, stageId) {
    if (!canWrite || !draggingId) return;
    event.preventDefault();
    setDropStageId(stageId);
  }

  function onColumnDrop(event, stageId) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain") || draggingId;
    const lead = leads.find((row) => String(row.id) === String(id));
    setDropStageId("");
    setDraggingId("");
    if (lead) moveStage(lead, stageId);
  }

  return (
    <div className="crm-page">
      <PageHeader
        eyebrow="Сделки"
        title="Воронка"
        subtitle="Лиды учебного центра — как сделки: этапы, задачи, конверсия."
        actions={
          <div className="actions">
            <div className="view-toggle" role="group" aria-label="Вид">
              <button
                type="button"
                className={view === "board" ? "is-active" : ""}
                onClick={() => setView("board")}
              >
                Доска
              </button>
              <button
                type="button"
                className={view === "table" ? "is-active" : ""}
                onClick={() => setView("table")}
              >
                Список
              </button>
            </div>
            <Button type="button" className="secondary" busy={exporting} onClick={exportExcel}>
              Excel
            </Button>
            {canWrite ? (
              <Button type="button" className="secondary" onClick={openStageCreate}>
                + Категория
              </Button>
            ) : null}
            {canWrite ? (
              <Button type="button" onClick={() => openCreate()}>
                + Новая сделка
              </Button>
            ) : null}
          </div>
        }
      />
      <Banner>{error}</Banner>
      <Banner tone="ok">{info}</Banner>

      <div className="crm-toolbar">
        <div className="crm-search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск и фильтр: имя, телефон, email…"
          />
          <button
            type="button"
            className={`crm-filter-btn ${filtersOpen ? "is-active" : ""}`}
            onClick={() => setFiltersOpen((v) => !v)}
          >
            Фильтры
          </button>
        </div>
        <div className="crm-toolbar-stats">
          <span>
            <strong>{filtered.length}</strong> на доске
          </span>
          <span className="dot" />
          <span>
            открытых <strong>{openLeads.length}</strong>
          </span>
          <span className="dot" />
          <span>
            конверсия <strong>{conversionRate}%</strong>
          </span>
          {overdueCount ? (
            <>
              <span className="dot" />
              <span className="text-warn">просрочено {overdueCount}</span>
            </>
          ) : null}
        </div>
      </div>

      {filtersOpen ? (
        <div className="crm-filters">
          <Field label="Источник">
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <option value="">Все</option>
              {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Задача">
            <select value={followFilter} onChange={(e) => setFollowFilter(e.target.value)}>
              <option value="all">Все</option>
              <option value="overdue">Просрочен контакт</option>
              <option value="today">Сегодня</option>
              <option value="scheduled">Запланирован</option>
            </select>
          </Field>
          <Field label="Статус">
            <select value={convertedFilter} onChange={(e) => setConvertedFilter(e.target.value)}>
              <option value="open">Открытые</option>
              <option value="converted">Ученики</option>
              <option value="all">Все</option>
            </select>
          </Field>
          <Button type="button" className="secondary compact" busy={loading} onClick={load}>
            Обновить
          </Button>
        </div>
      ) : null}

      {view === "board" ? (
        <section className="deals-board" aria-label="Воронка сделок">
          {stages.map((stage, index) => {
            const columnLeads = filtered.filter(
              (lead) => String(lead.stage) === String(stage.id),
            );
            const tone = stageTone(stage, index);
            const isDropTarget = dropStageId === stage.id;
            return (
              <div
                className={`deals-column ${tone} ${isDropTarget ? "is-drop" : ""}`}
                key={stage.id}
                onDragOver={(e) => onColumnDragOver(e, stage.id)}
                onDragLeave={() => setDropStageId("")}
                onDrop={(e) => onColumnDrop(e, stage.id)}
              >
                <div className="deals-column-head">
                  <div className="deals-column-title">
                    <strong>{stage.name}</strong>
                    <span>
                      {columnLeads.length}{" "}
                      {stage.is_won ? "успех" : stage.is_lost ? "отказ" : "в работе"}
                    </span>
                  </div>
                  {canWrite ? (
                    <div className="deals-column-actions">
                      <button
                        type="button"
                        className="deals-add-icon"
                        onClick={() => openCreate(stage.id)}
                        aria-label="Новая сделка"
                        title="Новая сделка"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="deals-del-icon"
                        onClick={() => openStageDelete(stage)}
                        aria-label="Удалить категорию"
                        title="Удалить категорию"
                      >
                        ×
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="deals-column-body">
                  {columnLeads.length ? (
                    columnLeads.map((lead) => {
                      const task = taskLabel(lead);
                      return (
                        <article
                          key={lead.id}
                          className={`deal-card ${draggingId === lead.id ? "is-dragging" : ""} ${
                            task.tone === "warn" ? "is-overdue" : ""
                          }`}
                          draggable={canWrite && !lead.converted_student}
                          onDragStart={(e) => onDragStart(e, lead)}
                          onDragEnd={onDragEnd}
                          onClick={() => openLead(lead)}
                        >
                          <div className="deal-card-top">
                            <Avatar name={lead.full_name} />
                            <div className="deal-card-copy">
                              <button
                                type="button"
                                className="deal-link"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openLead(lead);
                                }}
                              >
                                {lead.full_name}
                              </button>
                              <span className="deal-contact">
                                {lead.phone || lead.email || "Без контакта"}
                              </span>
                            </div>
                            <time className="deal-date">
                              {formatDate(lead.updated_at || lead.created_at)}
                            </time>
                          </div>
                          <div className="deal-card-foot">
                            <span className="deal-source">
                              {SOURCE_LABELS[lead.source] || lead.source || "—"}
                            </span>
                            <span className={`deal-task ${task.tone}`}>
                              <i />
                              {task.text}
                            </span>
                          </div>
                        </article>
                      );
                    })
                  ) : (
                    <p className="deals-empty">{loading ? "Загрузка…" : "Перетащите сюда"}</p>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      ) : (
        <section className="card">
          <DataTable
            rows={filtered}
            empty={loading ? "Загрузка…" : "Сделок по фильтру нет"}
            onRowClick={openLead}
            columns={[
              {
                key: "full_name",
                title: "Сделка",
                render: (row) => (
                  <div className="center-cell">
                    <strong>{row.full_name}</strong>
                    <span>{row.phone || row.email || "—"}</span>
                  </div>
                ),
              },
              {
                key: "source",
                title: "Источник",
                render: (row) => SOURCE_LABELS[row.source] || row.source || "—",
              },
              {
                key: "stage",
                title: "Стадия",
                render: (row) => stageOf(row)?.name || "—",
              },
              {
                key: "task",
                title: "Задача",
                render: (row) => {
                  const task = taskLabel(row);
                  return <span className={`deal-task ${task.tone}`}>{task.text}</span>;
                },
              },
              {
                key: "actions",
                title: "",
                render: (row) => (
                  <TextAction
                    onClick={(e) => {
                      e.stopPropagation();
                      openLead(row);
                    }}
                  >
                    Открыть
                  </TextAction>
                ),
              },
            ]}
          />
        </section>
      )}

      {createOpen ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Новая сделка">
          <button
            type="button"
            className="overlay-backdrop"
            aria-label="Закрыть"
            onClick={() => setCreateOpen(false)}
          />
          <form className="sheet" onSubmit={createLead}>
            <div className="sheet-head">
              <div>
                <div className="topbar-eyebrow">CRM</div>
                <h2>Новая сделка</h2>
                <p className="muted">Заявка сразу попадает в выбранный этап воронки.</p>
              </div>
              <button
                type="button"
                className="sheet-close"
                onClick={() => setCreateOpen(false)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="sheet-body">
              <div className="grid cols-2" style={{ gap: 12 }}>
                <Field label="ФИО / название">
                  <input
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    required
                    autoFocus
                  />
                </Field>
                <Field label="Телефон">
                  <input
                    value={form.phone}
                    onChange={(e) =>
                      onPhoneChange(e.target.value, (phone) => setForm({ ...form, phone }))
                    }
                    required
                    placeholder="+998 90 123 45 67"
                  />
                </Field>
                <Field label="Email">
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </Field>
                <Field label="Источник">
                  <select
                    value={form.source}
                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                  >
                    {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Стадия">
                  <select
                    value={form.stage}
                    onChange={(e) => setForm({ ...form, stage: e.target.value })}
                    required
                  >
                    {stages.map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="След. контакт">
                  <input
                    type="datetime-local"
                    value={form.next_follow_up_at}
                    onChange={(e) => setForm({ ...form, next_follow_up_at: e.target.value })}
                  />
                </Field>
                <Field label="Заметка">
                  <input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </Field>
              </div>
            </div>
            <div className="sheet-foot">
              <Button type="button" className="secondary" onClick={() => setCreateOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" busy={busy}>
                Создать
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {stageOpen ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Новая категория">
          <button
            type="button"
            className="overlay-backdrop"
            aria-label="Закрыть"
            onClick={() => setStageOpen(false)}
          />
          <form className="sheet" onSubmit={createStage}>
            <div className="sheet-head">
              <div>
                <div className="topbar-eyebrow">Воронка</div>
                <h2>Новая категория</h2>
                <p className="muted">Этап появится новой колонкой на доске.</p>
              </div>
              <button
                type="button"
                className="sheet-close"
                onClick={() => setStageOpen(false)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="sheet-body">
              <div className="grid" style={{ gap: 12 }}>
                <Field label="Название">
                  <input
                    value={stageForm.name}
                    onChange={(e) => setStageForm({ ...stageForm, name: e.target.value })}
                    placeholder="Например: Переговоры"
                    required
                    autoFocus
                  />
                </Field>
                <Field label="Тип этапа">
                  <select
                    value={stageForm.kind}
                    onChange={(e) => setStageForm({ ...stageForm, kind: e.target.value })}
                  >
                    <option value="open">В работе</option>
                    <option value="won">Успех (Won)</option>
                    <option value="lost">Отказ (Lost)</option>
                  </select>
                </Field>
              </div>
            </div>
            <div className="sheet-foot">
              <Button type="button" className="secondary" onClick={() => setStageOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" busy={busy}>
                Добавить категорию
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {stageDelete ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Удалить категорию">
          <button
            type="button"
            className="overlay-backdrop"
            aria-label="Закрыть"
            onClick={() => setStageDelete(null)}
          />
          <form className="sheet" onSubmit={confirmStageDelete}>
            <div className="sheet-head">
              <div>
                <div className="topbar-eyebrow">Воронка</div>
                <h2>Удалить «{stageDelete.stage.name}»</h2>
                <p className="muted">
                  {leads.filter((row) => String(row.stage) === String(stageDelete.stage.id)).length
                    ? "Сделки из этой категории нужно перенести в другой этап."
                    : "Категория пустая — можно удалить сразу."}
                </p>
              </div>
              <button
                type="button"
                className="sheet-close"
                onClick={() => setStageDelete(null)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="sheet-body">
              {leads.filter((row) => String(row.stage) === String(stageDelete.stage.id)).length ? (
                <Field label="Перенести сделки в">
                  <select
                    value={stageDelete.moveTo}
                    onChange={(e) =>
                      setStageDelete((prev) => ({ ...prev, moveTo: e.target.value }))
                    }
                    required
                  >
                    {stages
                      .filter((row) => String(row.id) !== String(stageDelete.stage.id))
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.name}
                        </option>
                      ))}
                  </select>
                </Field>
              ) : (
                <p className="muted">Подтвердите удаление категории.</p>
              )}
            </div>
            <div className="sheet-foot">
              <Button type="button" className="secondary" onClick={() => setStageDelete(null)}>
                Отмена
              </Button>
              <Button type="submit" busy={busy}>
                Удалить категорию
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {selected && draft ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Карточка сделки">
          <button
            type="button"
            className="overlay-backdrop"
            aria-label="Закрыть"
            onClick={closeLead}
          />
          <aside className="sheet sheet-detail">
            <div className="sheet-head">
              <div>
                <div className="topbar-eyebrow">
                  {stageOf(selected)?.name || "Сделка"}
                  {selected.converted_student ? " · ученик" : ""}
                </div>
                <h2>{selected.full_name}</h2>
                <p className="muted">
                  {selected.phone || "без телефона"}
                  {selected.email ? ` · ${selected.email}` : ""}
                </p>
              </div>
              <button type="button" className="sheet-close" onClick={closeLead} aria-label="Закрыть">
                ×
              </button>
            </div>

            <div className="sheet-body">
              <form className="grid" style={{ gap: 12 }} onSubmit={saveLead}>
                <Field label="ФИО">
                  <input
                    value={draft.full_name}
                    onChange={(e) => setDraft({ ...draft, full_name: e.target.value })}
                    disabled={!canWrite || Boolean(selected.converted_student)}
                    required
                  />
                </Field>
                <div className="grid cols-2" style={{ gap: 12 }}>
                  <Field label="Телефон">
                    <input
                      value={draft.phone}
                      onChange={(e) =>
                        onPhoneChange(e.target.value, (phone) => setDraft({ ...draft, phone }))
                      }
                      disabled={!canWrite || Boolean(selected.converted_student)}
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      value={draft.email}
                      onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                      disabled={!canWrite || Boolean(selected.converted_student)}
                    />
                  </Field>
                </div>
                <div className="grid cols-2" style={{ gap: 12 }}>
                  <Field label="Источник">
                    <select
                      value={draft.source}
                      onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                      disabled={!canWrite || Boolean(selected.converted_student)}
                    >
                      {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Стадия">
                    <select
                      value={draft.stage}
                      onChange={(e) => setDraft({ ...draft, stage: e.target.value })}
                      disabled={!canWrite || Boolean(selected.converted_student)}
                    >
                      {stages.map((stage) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Следующий контакт">
                  <input
                    type="datetime-local"
                    value={draft.next_follow_up_at}
                    onChange={(e) => setDraft({ ...draft, next_follow_up_at: e.target.value })}
                    disabled={!canWrite || Boolean(selected.converted_student)}
                  />
                </Field>
                <Field label="Заметки">
                  <textarea
                    rows={3}
                    value={draft.notes}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    disabled={!canWrite || Boolean(selected.converted_student)}
                  />
                </Field>
                {stageOf({ stage: draft.stage })?.is_lost ? (
                  <Field label="Причина отказа">
                    <input
                      value={draft.lost_reason}
                      onChange={(e) => setDraft({ ...draft, lost_reason: e.target.value })}
                      disabled={!canWrite || Boolean(selected.converted_student)}
                    />
                  </Field>
                ) : null}
                {canWrite && !selected.converted_student ? (
                  <Button type="submit" busy={busy}>
                    Сохранить
                  </Button>
                ) : null}
              </form>

              {!selected.converted_student && canWrite ? (
                <section className="crm-block">
                  <h3>Конвертация в ученика</h3>
                  <p className="muted">Создаёт карточку ученика и закрывает сделку как успех.</p>
                  <Field label="Группа (необязательно)">
                    <select
                      value={convertGroup}
                      onChange={(e) => setConvertGroup(e.target.value)}
                    >
                      <option value="">Без группы</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Button type="button" busy={busy} onClick={convertLead}>
                    Сделать учеником
                  </Button>
                </section>
              ) : null}

              <section className="crm-block">
                <h3>Активности</h3>
                {canWrite && !selected.converted_student ? (
                  <form className="grid" style={{ gap: 10, marginBottom: 12 }} onSubmit={addActivity}>
                    <Field label="Тип">
                      <select
                        value={activityForm.kind}
                        onChange={(e) =>
                          setActivityForm({ ...activityForm, kind: e.target.value })
                        }
                      >
                        {Object.entries(ACTIVITY_KIND_LABELS)
                          .filter(([value]) => value !== "stage_change")
                          .map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="Текст">
                      <textarea
                        rows={2}
                        value={activityForm.content}
                        onChange={(e) =>
                          setActivityForm({ ...activityForm, content: e.target.value })
                        }
                        placeholder="Звонок, договорённость, комментарий…"
                        required
                      />
                    </Field>
                    <Button type="submit" className="secondary" busy={busy}>
                      Добавить
                    </Button>
                  </form>
                ) : null}
                {activities.length ? (
                  <ul className="activity-list">
                    {activities.map((item) => (
                      <li key={item.id}>
                        <div className="activity-top">
                          <Badge
                            value={item.kind}
                            label={ACTIVITY_KIND_LABELS[item.kind] || item.kind}
                          />
                          <span className="muted">
                            {formatWhen(item.occurred_at || item.created_at)}
                          </span>
                        </div>
                        <p>{item.content}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty">Пока нет звонков и заметок.</p>
                )}
              </section>
            </div>

            <div className="sheet-foot detail-foot">
              {leadDeleteAsk ? (
                <>
                  <p className="deal-delete-hint">
                    Удалить сделку «{selected.full_name}» без восстановления?
                  </p>
                  <Button type="button" className="secondary" onClick={() => setLeadDeleteAsk(false)}>
                    Нет
                  </Button>
                  <Button type="button" busy={busy} onClick={confirmDeleteLead}>
                    Да, удалить
                  </Button>
                </>
              ) : (
                <>
                  {canWrite ? (
                    <Button type="button" className="secondary" busy={busy} onClick={askDeleteLead}>
                      Удалить
                    </Button>
                  ) : null}
                  <Button type="button" className="secondary" onClick={closeLead}>
                    Закрыть
                  </Button>
                  {selected.phone ? (
                    <a
                      className="btn secondary"
                      href={`tel:${String(selected.phone).replace(/\s/g, "")}`}
                    >
                      Позвонить
                    </a>
                  ) : null}
                </>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
