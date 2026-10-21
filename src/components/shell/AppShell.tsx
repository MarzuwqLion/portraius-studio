import { NavLink, Outlet } from "react-router";
import { cn } from "@/lib/utils";
import { JobsTray } from "./JobsTray";
import { SETTINGS_NAV, WORK_NAV, type NavItem } from "./nav";

function RailLink({ item, compact = false }: { item: NavItem; compact?: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          "flex flex-col items-center justify-center gap-1 rounded-control text-control text-ink hover:bg-tint-hover",
          compact ? "min-w-0 flex-1 py-2" : "w-full py-3",
          isActive && "bg-accent font-semibold text-on-accent hover:bg-accent",
        )
      }
    >
      <Icon className="size-5" aria-hidden />
      <span className="max-w-full truncate px-1">{item.label}</span>
    </NavLink>
  );
}

export function AppShell() {
  return (
    <div className="flex h-full flex-col bg-proof text-ink">
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Studio" className="hidden w-24 shrink-0 flex-col gap-1 border-r border-rule p-2 md:flex">
          <NavLink to="/" className="mb-2 px-1 py-2 text-center font-display text-panel font-extrabold leading-none text-accent-text">
            Portraius
          </NavLink>
          {WORK_NAV.map((item) => (
            <RailLink key={item.to} item={item} />
          ))}
          <div className="mt-auto">
            <RailLink item={SETTINGS_NAV} />
          </div>
        </nav>
        <main className="min-w-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <JobsTray />
      <nav aria-label="Studio" className="flex border-t border-rule px-1 md:hidden">
        {[...WORK_NAV, SETTINGS_NAV].map((item) => (
          <RailLink key={item.to} item={item} compact />
        ))}
      </nav>
    </div>
  );
}
