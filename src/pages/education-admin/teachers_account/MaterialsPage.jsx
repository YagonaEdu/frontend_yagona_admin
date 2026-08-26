import { useCallback, useEffect, useMemo, useState } from "react";
import { Banner, Button, EmptyState, SearchInput } from "@/components/ui";
import { api, invalidateApiCache } from "@/services/api/client";
import { asList } from "./utils";
import { IconUsers, SUMMARY_ICON_MAP } from "./tgIcons";
import {
  MATERIAL_TABS,
  mergeLibrary,
  statusLabel,
  statusTone,
  tabMatches,
  materialKindLabel,
  formatCreated,
} from "./materialHelpers";
import MaterialTypeModal from "./MaterialTypeModal";
import MaterialFormSheet from "./MaterialFormSheet";
import VocabularyFormSheet from "./VocabularyFormSheet";
import QuizBuilderSheet from "./QuizBuilderSheet";
import MaterialDetailDrawer from "./MaterialDetailDrawer";

function ListSkeleton() {
  return (
    <div className="tm-skeleton">
      {[1, 2, 3, 4, 5].map((key) => (
        <div key={key} className="tm-skeleton-row" />
      ))}
    </div>
  );
}

export default function TeacherMaterialsPage() {
  const [materials, setMaterials] = useState([]);
  const [vocabulary, setVocabulary] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [groups, setGroups] = useState([]);
  const [courses, setCourses] = useState([]);
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [formType, setFormType] = useState("");
  const [materialFormOpen, setMaterialFormOpen] = useState(false);
  const [vocabFormOpen, setVocabFormOpen] = useState(false);
  const [quizFormOpen, setQuizFormOpen] = useState(false);
  const [editMaterial, setEditMaterial] = useState(null);
  const [editVocabulary, setEditVocabulary] = useState(null);
  const [editQuiz, setEditQuiz] = useState(null);
  const [selected, setSelected] = useState(null);
  const [menuOpen, setMenuOpen] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const results = await Promise.allSettled([
        asList("/materials?page_size=300"),
        asList("/vocabulary-sets?page_size=200"),
        asList("/quizzes?page_size=200"),
        asList("/groups?page_size=100"),
        asList("/courses?page_size=100"),
      ]);
      const [m, v, q, g, c] = results;
      if (m.status === "fulfilled") setMaterials(m.value);
      if (v.status === "fulfilled") setVocabulary(v.value);
      if (q.status === "fulfilled") setQuizzes(q.value);
      if (g.status === "fulfilled") setGroups(g.value);
      if (c.status === "fulfilled") setCourses(c.value);
      const failed = results.find((row) => row.status === "rejected");
      if (failed?.status === "rejected") {
        setError(failed.reason?.message || "Не удалось загрузить часть данных.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const groupMap = useMemo(() => new Map(groups.map((row) => [String(row.id), row.name])), [groups]);
  const courseMap = useMemo(() => new Map(courses.map((row) => [String(row.id), row.name])), [courses]);

  const library = useMemo(
    () => mergeLibrary(materials, vocabulary, quizzes),
    [materials, vocabulary, quizzes],
  );

  const filtered = useMemo(() => {
    return library.filter((item) => {
      if (!tabMatches(tab, item)) return false;
      if (query && !item.title.toLowerCase().includes(query.toLowerCase())) return false;
      if (typeFilter && item.kind !== typeFilter) return false;
      if (groupFilter && String(item.group) !== groupFilter) return false;
      if (courseFilter && String(item.course) !== courseFilter) return false;
      if (statusFilter && item.status !== statusFilter) return false;
      return true;
    });
  }, [library, tab, query, typeFilter, groupFilter, courseFilter, statusFilter]);

  const summary = useMemo(() => {
    const published = library.filter((row) => row.status === "published").length;
    const quizCount = library.filter((row) => row.kind === "quiz").length;
    const vocabCount = library.filter((row) => row.kind === "vocabulary").length;
    return [
      { key: "students", label: "Всего материалов", value: library.length },
      { key: "reviews", label: "Тестов", value: quizCount },
      { key: "groups", label: "Vocabulary", value: vocabCount },
      { key: "week", label: "Опубликовано", value: published },
    ];
  }, [library]);

  const hasFilters = Boolean(query || typeFilter || groupFilter || courseFilter || statusFilter);

  function resetFilters() {
    setQuery("");
    setTypeFilter("");
    setGroupFilter("");
    setCourseFilter("");
    setStatusFilter("");
  }

  function refresh() {
    invalidateApiCache("/materials");
    invalidateApiCache("/vocabulary-sets");
    invalidateApiCache("/quizzes");
    load();
  }

  function openCreateType(type) {
    setTypeModalOpen(false);
    setEditMaterial(null);
    setEditVocabulary(null);
    setEditQuiz(null);
    if (type === "vocabulary") {
      setVocabFormOpen(true);
      return;
    }
    if (type === "quiz") {
      setQuizFormOpen(true);
      return;
    }
    setFormType(type);
    setMaterialFormOpen(true);
  }

  async function openItem(item) {
    setSelected(item);
    if (item.kind === "vocabulary") {
      try {
        const full = await api.get(`/vocabulary-sets/${item.id}`);
        setEditVocabulary(full);
      } catch {
        setEditVocabulary(item.raw);
      }
    } else if (item.kind === "quiz") {
      try {
        const full = await api.get(`/quizzes/${item.id}`);
        setEditQuiz(full);
      } catch {
        setEditQuiz(item.raw);
      }
    } else {
      try {
        const full = await api.get(`/materials/${item.id}`);
        setEditMaterial(full);
      } catch {
        setEditMaterial(item.raw);
      }
    }
  }

  async function handleEdit(item) {
    await openItem(item);
    if (item.kind === "vocabulary") setVocabFormOpen(true);
    else if (item.kind === "quiz") setQuizFormOpen(true);
    else {
      setFormType(item.kind);
      setMaterialFormOpen(true);
    }
  }

  async function handleDuplicate(item) {
    setMenuOpen("");
    try {
      if (item.kind === "quiz") await api.post(`/quizzes/${item.id}/duplicate`);
      else if (item.kind === "vocabulary") {
        const full = await api.get(`/vocabulary-sets/${item.id}`);
        await api.post("/vocabulary-sets", {
          title: `${full.title} (копия)`,
          description: full.description,
          group: full.group,
          course: full.course,
          topic: full.topic,
          status: "draft",
          entries: (full.entries || []).map(({ word, translation, definition, example, pronunciation, part_of_speech }) => ({
            word,
            translation,
            definition,
            example,
            pronunciation,
            part_of_speech,
          })),
        });
      } else await api.post(`/materials/${item.id}/duplicate`);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleArchive(item) {
    setMenuOpen("");
    try {
      if (item.kind === "quiz") await api.post(`/quizzes/${item.id}/archive`);
      else if (item.kind === "vocabulary") await api.post(`/vocabulary-sets/${item.id}/archive`);
      else await api.post(`/materials/${item.id}/archive`);
      setSelected(null);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function generateQuizFromVocab(item) {
    try {
      await api.post(`/vocabulary-sets/${item.id}/generate_quiz`, {
        question_count: 10,
        direction: "mixed",
      });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="tm-page">
      <header className="tg-header tm-header">
        <div>
          <h1>Материалы</h1>
          <p className="tg-sub">Учебные материалы, тесты и словари для ваших групп</p>
        </div>
        <Button onClick={() => setTypeModalOpen(true)}>+ Добавить материал</Button>
      </header>

      {error ? (
        <Banner>
          Не удалось загрузить материалы.{" "}
          <Button variant="ghost" onClick={refresh}>Повторить</Button>
        </Banner>
      ) : null}

      <div className="tg-summary tg-summary-4">
        {summary.map((item) => {
          const Icon = SUMMARY_ICON_MAP[item.key] || IconUsers;
          return (
            <div key={item.key} className={`tg-summary-item tg-summary-${item.key}`}>
              <span className="tg-summary-icon"><Icon size={16} /></span>
              <div>
                <strong>{loading ? "…" : item.value}</strong>
                <span className="tg-summary-label">{item.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      <section className="tm-main">
        <div className="tm-tabs" role="tablist" aria-label="Типы материалов">
          {MATERIAL_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? "is-active" : ""}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="tm-toolbar">
          <div className="tm-toolbar-row">
            <SearchInput value={query} onChange={setQuery} placeholder="Найти материал..." />
            <button type="button" className="tm-filters-toggle" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen}>
              Фильтры
            </button>
          </div>
          <div className={`tm-toolbar-filters${filtersOpen ? " is-open" : ""}`}>
            <label className="tm-filter-field">
              <span className="tm-filter-label">Тип</span>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">Все типы</option>
                <option value="file">Файл</option>
                <option value="pdf">PDF</option>
                <option value="link">Ссылка</option>
                <option value="video">Видео</option>
                <option value="vocabulary">Vocabulary</option>
                <option value="quiz">Тест</option>
              </select>
            </label>
            <label className="tm-filter-field">
              <span className="tm-filter-label">Группа</span>
              <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
                <option value="">Все группы</option>
                {groups.map((row) => (
                  <option key={row.id} value={row.id}>{row.name}</option>
                ))}
              </select>
            </label>
            <label className="tm-filter-field">
              <span className="tm-filter-label">Курс</span>
              <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
                <option value="">Все курсы</option>
                {courses.map((row) => (
                  <option key={row.id} value={row.id}>{row.name}</option>
                ))}
              </select>
            </label>
            <label className="tm-filter-field">
              <span className="tm-filter-label">Статус</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">Все</option>
                <option value="draft">Черновик</option>
                <option value="published">Опубликовано</option>
                <option value="archived">Архив</option>
              </select>
            </label>
            {hasFilters ? (
              <button type="button" className="tm-reset-btn" onClick={resetFilters}>Сбросить</button>
            ) : null}
          </div>
        </div>

        {loading ? <ListSkeleton /> : null}

        {!loading && !library.length ? (
          <EmptyState
            title="Материалов пока нет"
            body="Добавьте книгу, vocabulary или создайте первый тест."
            action={<Button onClick={() => setTypeModalOpen(true)}>+ Добавить материал</Button>}
          />
        ) : null}

        {!loading && library.length && !filtered.length ? (
          <EmptyState title="Материалы не найдены" />
        ) : null}

        <div className="tm-list">
          {filtered.map((item) => (
            <article key={`${item.kind}-${item.id}`} className="tm-row">
              <button type="button" className="tm-row-main" onClick={() => openItem(item)}>
                <span className={`tm-row-icon tm-type-${item.kind}`} aria-hidden="true" />
                <span className="tm-row-content">
                  <span className="tm-row-title">{item.title}</span>
                  <span className="tm-row-sub">
                    {materialKindLabel(item.kind)} · {groupMap.get(String(item.group)) || "Без группы"} · {formatCreated(item.created_at)}
                  </span>
                  <span className="tg-muted">{item.meta}</span>
                </span>
              </button>
              <div className="tm-row-side">
                <span className={`tg-pill tg-pill-${statusTone(item.status)}`}>{statusLabel(item.status)}</span>
                <div className="tm-row-actions">
                  <Button variant="ghost" onClick={() => openItem(item)}>Открыть</Button>
                  {item.kind === "quiz" ? (
                    <Button variant="ghost" onClick={() => { setSelected(item); }}>Результаты</Button>
                  ) : null}
                  {item.kind === "vocabulary" ? (
                    <Button variant="ghost" onClick={() => generateQuizFromVocab(item)}>Создать тест</Button>
                  ) : null}
                  <div className="ta-menu-wrap">
                    <button type="button" className="icon-btn" aria-label="Меню" onClick={() => setMenuOpen(menuOpen === item.id ? "" : item.id)}>⋯</button>
                    {menuOpen === item.id ? (
                      <div className="ta-menu">
                        <button type="button" onClick={() => handleEdit(item)}>Редактировать</button>
                        <button type="button" onClick={() => handleDuplicate(item)}>Дублировать</button>
                        <button type="button" onClick={() => handleArchive(item)}>Архивировать</button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <MaterialTypeModal open={typeModalOpen} onClose={() => setTypeModalOpen(false)} onSelect={openCreateType} />
      <MaterialFormSheet
        open={materialFormOpen}
        type={formType}
        material={editMaterial}
        groups={groups}
        courses={courses}
        onClose={() => setMaterialFormOpen(false)}
        onSaved={refresh}
      />
      <VocabularyFormSheet
        open={vocabFormOpen}
        vocabulary={editVocabulary}
        groups={groups}
        courses={courses}
        onClose={() => setVocabFormOpen(false)}
        onSaved={refresh}
      />
      <QuizBuilderSheet
        open={quizFormOpen}
        quiz={editQuiz}
        groups={groups}
        courses={courses}
        onClose={() => setQuizFormOpen(false)}
        onSaved={refresh}
      />
      <MaterialDetailDrawer
        item={selected}
        groupMap={groupMap}
        courseMap={courseMap}
        onClose={() => setSelected(null)}
        onEdit={handleEdit}
        onResults={(item) => setSelected(item)}
        onDuplicate={handleDuplicate}
        onArchive={handleArchive}
      />
    </div>
  );
}
