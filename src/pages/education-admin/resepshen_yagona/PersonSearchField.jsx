import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatQueryWithPhone } from "@/utils/format";
import { digits } from "./utils";

function matchPersonOption(option, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const qDigits = digits(q);
  const person = option.person || {};
  const haystack = [option.label, person.full_name, person.phone, person.email]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (haystack.includes(q)) return true;
  if (qDigits.length >= 3) {
    const phoneDigits = digits(person.phone || "");
    if (phoneDigits.includes(qDigits)) return true;
  }
  return false;
}

export default function PersonSearchField({
  person,
  options = [],
  onChange,
  placeholder = "Имя, телефон или email…",
  required = false,
}) {
  const listId = useId();
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selectedKey = person?.id ? `${person.kind || "lead"}:${person.id}` : "";
  const selectedLabel = useMemo(() => {
    const found = options.find((item) => item.key === selectedKey);
    return found?.label || "";
  }, [options, selectedKey]);

  useEffect(() => {
    if (selectedLabel) {
      setQuery((prev) => (prev === selectedLabel ? prev : selectedLabel));
    } else if (!open) {
      setQuery((prev) => (prev === "" ? prev : ""));
    }
  }, [selectedLabel, open]);

  useEffect(() => {
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const filtered = useMemo(() => {
    const matched = options.filter((item) => matchPersonOption(item, query));
    return matched.slice(0, 40);
  }, [options, query]);

  function handleInputChange(event) {
    const next = formatQueryWithPhone(event.target.value);
    setQuery(next);
    setOpen(true);
    if (selectedKey && next !== selectedLabel) {
      onChange?.(null);
    }
  }

  function handleSelect(item) {
    onChange?.(item.person);
    setQuery(item.label);
    setOpen(false);
  }

  function handleClear() {
    onChange?.(null);
    setQuery("");
    setOpen(true);
    inputRef.current?.focus();
  }

  return (
    <div className="person-search" ref={rootRef}>
      <div className="person-search-input-wrap">
        <input
          ref={inputRef}
          type="search"
          className="person-search-input"
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-required={required || undefined}
          onFocus={() => setOpen(true)}
          onChange={handleInputChange}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
        />
        {query ? (
          <button
            type="button"
            className="person-search-clear"
            aria-label="Очистить"
            onClick={handleClear}
          >
            ×
          </button>
        ) : null}
      </div>

      {open ? (
        <ul id={listId} className="person-search-menu" role="listbox">
          {!filtered.length ? (
            <li className="person-search-empty" role="presentation">
              {query.trim() ? "Никого не найдено" : "Начните вводить имя или телефон"}
            </li>
          ) : (
            filtered.map((item) => (
              <li key={item.key} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={item.key === selectedKey}
                  className={`person-search-option${item.key === selectedKey ? " is-active" : ""}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSelect(item)}
                >
                  {item.label}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {required && !person?.full_name ? (
        <input
          tabIndex={-1}
          aria-hidden="true"
          className="person-search-required"
          value=""
          required
          onChange={() => {}}
        />
      ) : null}
    </div>
  );
}
