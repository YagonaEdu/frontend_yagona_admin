import { NavLink } from "react-router-dom";
import { NavIcon } from "./navIcons";

export function GroupedNav({ items, collapsed = false }) {
  const groups = [];
  for (const item of items) {
    const name = item.group || "Меню";
    let group = groups.find((entry) => entry.name === name);
    if (!group) {
      group = { name, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }

  return (
    <nav className={`nav${collapsed ? " is-collapsed" : ""}`} aria-label="Основное меню">
      {groups.map((group) => (
        <div className="nav-group" key={group.name}>
          {!collapsed ? <div className="nav-group-label">{group.name}</div> : null}
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={collapsed ? item.label : undefined}
              className={collapsed ? "nav-link-icon" : undefined}
            >
              <NavIcon segment={item.segment} size={18} />
              {!collapsed ? <span className="nav-link-label">{item.label}</span> : null}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}
