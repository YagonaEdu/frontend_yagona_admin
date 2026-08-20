import { NavLink } from "react-router-dom";

export function GroupedNav({ items }) {
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
    <nav className="nav" aria-label="Основное меню">
      {groups.map((group) => (
        <div className="nav-group" key={group.name}>
          <div className="nav-group-label">{group.name}</div>
          {group.items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              {item.label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}
