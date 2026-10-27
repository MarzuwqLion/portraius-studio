import { useLayoutEffect, useRef } from "react";
import { NavLink, Outlet, useLocation, useNavigationType } from "react-router";
import { cn } from "@/lib/utils";
import { Backdrop } from "./Backdrop";
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
      {/* Seven labels share a phone's width; under 400 px they take the smaller tab size so all fit. */}
      <span className={cn("max-w-full truncate", compact ? "px-0.5 max-[399px]:text-tab" : "px-1")}>{item.label}</span>
    </NavLink>
  );
}

// <main> outlives the routes, so it would keep one screen's scroll for the
// next. A new navigation (push or replace) opens at the top, the call sheet
// included; back and forward return to where that screen was left.
function useScrollPerScreen() {
  const main = useRef<HTMLElement>(null);
  const location = useLocation();
  const type = useNavigationType();
  const positions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = main.current;
    if (!el) return;
    el.scrollTop = type === "POP" ? (positions.current.get(location.key) ?? 0) : 0;
    if (type !== "POP") el.querySelectorAll<HTMLElement>("[data-scroll-top]").forEach((inner) => (inner.scrollTop = 0));
  }, [location.key]);
  const onScroll = () => {
    if (main.current) positions.current.set(location.key, main.current.scrollTop);
  };
  return { main, onScroll };
}

export function AppShell() {
  const { main, onScroll } = useScrollPerScreen();
  return (
    <div className="shell flex h-full flex-col bg-proof text-ink">
      <Backdrop />
      {/* The first focus stop on every screen, seen only when focused. Not a
          #fragment: the hash belongs to the router. */}
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          main.current?.focus();
        }}
        className="sr-only rounded-control bg-accent text-control font-semibold text-on-accent focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="shell-body flex min-h-0 flex-1">
        <nav aria-label="Studio" className="shell-panel hidden w-24 shrink-0 flex-col gap-1 border-r border-rule p-2 md:flex">
          <NavLink to="/" className="shell-logo mb-2 px-1 py-2 text-center font-display text-panel font-extrabold leading-none text-accent-text">
            Portraius
          </NavLink>
          {WORK_NAV.map((item) => (
            <RailLink key={item.to} item={item} />
          ))}
          <div className="mt-auto">
            <RailLink item={SETTINGS_NAV} />
          </div>
        </nav>
        <main ref={main} tabIndex={-1} onScroll={onScroll} className="shell-panel min-w-0 flex-1 overflow-auto focus:outline-none">
          <Outlet />
        </main>
      </div>
      <JobsTray />
      <nav aria-label="Studio" className="shell-panel flex border-t border-rule px-1 md:hidden">
        {[...WORK_NAV, SETTINGS_NAV].map((item) => (
          <RailLink key={item.to} item={item} compact />
        ))}
      </nav>
    </div>
  );
}
