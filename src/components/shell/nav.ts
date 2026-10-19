import { Clapperboard, Film, Image, LibraryBig, Repeat2, Settings, Users, type LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const WORK_NAV: readonly NavItem[] = [
  { to: "/characters", label: "Characters", icon: Users },
  { to: "/image", label: "Image", icon: Image },
  { to: "/video", label: "Video", icon: Film },
  { to: "/recast", label: "Recast", icon: Repeat2 },
  { to: "/director", label: "Director", icon: Clapperboard },
  { to: "/library", label: "Library", icon: LibraryBig },
];

export const SETTINGS_NAV: NavItem = { to: "/settings", label: "Settings", icon: Settings };
