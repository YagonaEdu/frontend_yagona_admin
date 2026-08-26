import { formatDate } from "@/utils/format";

export const MATERIAL_TABS = [
  { id: "all", label: "Все" },
  { id: "files", label: "Файлы" },
  { id: "vocabulary", label: "Vocabulary" },
  { id: "quiz", label: "Тесты" },
  { id: "links", label: "Ссылки" },
  { id: "drafts", label: "Черновики" },
];

export const TYPE_OPTIONS = [
  { id: "file", label: "Файл", hint: "Документ или материал" },
  { id: "pdf", label: "PDF / Книга", hint: "Учебник или книга" },
  { id: "link", label: "Ссылка", hint: "Внешний ресурс" },
  { id: "video", label: "Видео", hint: "YouTube или ссылка" },
  { id: "vocabulary", label: "Vocabulary", hint: "Набор слов" },
  { id: "quiz", label: "Тест / Quiz", hint: "Проверка знаний" },
  { id: "text", label: "Текст", hint: "Текстовый материал" },
];

export const QUESTION_TYPES = [
  { id: "single", label: "Один правильный ответ" },
  { id: "multiple", label: "Несколько правильных" },
  { id: "true_false", label: "Да / Нет" },
  { id: "short_text", label: "Короткий ответ" },
];

export function formatBytes(size) {
  if (!size && size !== 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function materialKindLabel(kind) {
  const map = {
    file: "Файл",
    pdf: "PDF",
    link: "Ссылка",
    video: "Видео",
    text: "Текст",
    vocabulary: "Vocabulary",
    quiz: "Тест",
  };
  return map[kind] || kind;
}

export function statusLabel(status) {
  if (status === "published") return "Опубликовано";
  if (status === "archived") return "Архив";
  return "Черновик";
}

export function statusTone(status) {
  if (status === "published") return "green";
  if (status === "archived") return "gray";
  return "amber";
}

export function normalizeLibraryItem(row) {
  if (row.contentKind === "vocabulary" || row.word_count != null) {
    return {
      id: row.id,
      kind: "vocabulary",
      title: row.title,
      description: row.description,
      group: row.group,
      course: row.course,
      status: row.status,
      meta: `${row.word_count || 0} слов`,
      created_at: row.created_at,
      raw: row,
    };
  }
  if (row.contentKind === "quiz" || row.question_count != null) {
    return {
      id: row.id,
      kind: "quiz",
      title: row.title,
      description: row.description,
      group: row.group,
      course: row.course,
      status: row.status,
      meta: `${row.question_count || 0} вопросов · ${row.max_score || 0} баллов`,
      created_at: row.created_at,
      raw: row,
    };
  }
  const type = row.material_type || "file";
  let meta = materialKindLabel(type);
  if (row.file_size) meta += ` · ${formatBytes(row.file_size)}`;
  if (type === "link" || type === "video") meta = type === "video" ? "Видео" : "Ссылка";
  return {
    id: row.id,
    kind: type,
    title: row.title,
    description: row.description,
    group: row.group,
    course: row.course,
    status: row.status || (row.is_published ? "published" : "draft"),
    meta,
    link: row.link,
    file: row.file,
    created_at: row.created_at,
    raw: row,
  };
}

export function mergeLibrary(materials = [], vocabulary = [], quizzes = []) {
  const rows = [
    ...materials.map((row) => normalizeLibraryItem(row)),
    ...vocabulary.map((row) => normalizeLibraryItem({ ...row, contentKind: "vocabulary" })),
    ...quizzes.map((row) => normalizeLibraryItem({ ...row, contentKind: "quiz" })),
  ];
  return rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export function tabMatches(tab, item) {
  if (tab === "all") return item.status !== "archived";
  if (tab === "drafts") return item.status === "draft";
  if (tab === "files") return ["file", "pdf", "text"].includes(item.kind);
  if (tab === "vocabulary") return item.kind === "vocabulary";
  if (tab === "quiz") return item.kind === "quiz";
  if (tab === "links") return ["link", "video"].includes(item.kind);
  return true;
}

export function parseBulkVocabulary(text) {
  const rows = [];
  for (const line of (text || "").split("\n")) {
    const raw = line.trim();
    if (!raw) continue;
    let parts = null;
    if (raw.includes("|")) parts = raw.split("|").map((v) => v.trim());
    else if (raw.includes(" - ")) parts = raw.split(" - ").map((v) => v.trim());
    else if (raw.includes("\t")) parts = raw.split("\t").map((v) => v.trim());
    if (parts?.length === 2 && parts[0] && parts[1]) {
      rows.push({ word: parts[0], translation: parts[1], definition: "", example: "" });
    }
  }
  return rows;
}

export function emptyQuestion(type = "single") {
  if (type === "true_false") {
    return {
      question_type: "true_false",
      text: "",
      points: 1,
      options: [
        { text: "True", is_correct: false },
        { text: "False", is_correct: true },
      ],
      accepted_answers: [],
    };
  }
  if (type === "short_text") {
    return {
      question_type: "short_text",
      text: "",
      points: 1,
      options: [],
      accepted_answers: [{ text: "" }],
      case_sensitive: false,
    };
  }
  if (type === "multiple") {
    return {
      question_type: "multiple",
      text: "",
      points: 1,
      options: [
        { text: "", is_correct: false },
        { text: "", is_correct: false },
      ],
      accepted_answers: [],
    };
  }
  return {
    question_type: "single",
    text: "",
    points: 1,
    options: [
      { text: "", is_correct: true },
      { text: "", is_correct: false },
    ],
    accepted_answers: [],
  };
}

export function validateQuizDraft(questions = []) {
  const errors = [];
  if (!questions.length) errors.push("Добавьте хотя бы один вопрос.");
  questions.forEach((question, index) => {
    const label = `Вопрос ${index + 1}`;
    if (!question.text?.trim()) errors.push(`${label}: введите текст вопроса.`);
    if (!question.points || Number(question.points) <= 0) errors.push(`${label}: укажите баллы.`);
    if (question.question_type === "short_text") {
      const accepted = (question.accepted_answers || []).map((row) => row.text?.trim()).filter(Boolean);
      if (!accepted.length) errors.push(`${label}: добавьте принимаемый ответ.`);
    } else {
      const options = question.options || [];
      const correct = options.filter((row) => row.is_correct);
      if (options.length < 2) errors.push(`${label}: минимум 2 варианта.`);
      if (question.question_type === "single" && correct.length !== 1) {
        errors.push(`${label}: выберите один правильный ответ.`);
      }
      if (question.question_type === "multiple" && !correct.length) {
        errors.push(`${label}: отметьте правильные ответы.`);
      }
      if (question.question_type === "true_false" && correct.length !== 1) {
        errors.push(`${label}: выберите правильный ответ True/False.`);
      }
    }
  });
  return errors;
}

export function formatCreated(iso) {
  if (!iso) return "—";
  return formatDate(iso);
}
