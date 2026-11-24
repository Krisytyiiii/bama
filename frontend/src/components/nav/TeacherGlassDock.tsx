"use client";

import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { cn } from "@/lib/utils";
import styles from "./teacher-glass-dock.module.css";

export type TeacherDockItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Red "new or updated" marker (from `/api/teacher/nav-counts`). */
  dot?: boolean;
};

export type TeacherDockGroup = {
  label: string;
  items: TeacherDockItem[];
};

/** Base tile edge and the hovered edge (px) the dock magnifies to. */
const BASE_SIZE = 40;
const PEAK_SIZE = 58;
/** Cursor distance (px) over which a tile reaches full magnification. */
const MAGNIFY_RADIUS = 130;

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return reduce;
}

function DockTile({
  item,
  index,
  active,
  mouseY,
  reduce,
  onEnter,
  onLeave,
}: {
  item: TeacherDockItem;
  index: number;
  active: boolean;
  mouseY: MotionValue<number>;
  reduce: boolean;
  onEnter: (label: string, element: HTMLElement) => void;
  onLeave: () => void;
}) {
  const ref = React.useRef<HTMLLIElement>(null);
  const Icon = item.icon;

  // Cursor distance to this tile's centre, recomputed every pointer move.
  const distance = useTransform(mouseY, (y) => {
    if (!Number.isFinite(y)) return MAGNIFY_RADIUS * 2;
    const bounds = ref.current?.getBoundingClientRect();
    if (!bounds) return MAGNIFY_RADIUS * 2;
    return y - (bounds.top + bounds.height / 2);
  });
  const targetSize = useTransform(
    distance,
    [-MAGNIFY_RADIUS, 0, MAGNIFY_RADIUS],
    [BASE_SIZE, PEAK_SIZE, BASE_SIZE],
    { clamp: true },
  );
  const size = useSpring(targetSize, {
    stiffness: 320,
    damping: 26,
    mass: 0.35,
  });
  const iconScale = useTransform(size, [BASE_SIZE, PEAK_SIZE], [1, 1.26]);

  return (
    <li
      ref={ref}
      className={styles.slot}
      style={{ "--tile-index": index } as React.CSSProperties}
      onPointerEnter={(event) => onEnter(item.title, event.currentTarget)}
      onPointerLeave={onLeave}
      onFocus={(event) => onEnter(item.title, event.currentTarget)}
      onBlur={onLeave}
    >
      <motion.div
        className={styles.tileWrap}
        style={reduce ? undefined : { width: size, height: size }}
      >
        <Link
          href={item.href}
          className={cn(styles.tile, active && styles.tileActive)}
          aria-current={active ? "page" : undefined}
          aria-label={item.dot ? `${item.title} — new activity` : item.title}
        >
          <motion.span
            className={styles.icon}
            style={reduce ? undefined : { scale: iconScale }}
          >
            <Icon size={18} strokeWidth={1.9} aria-hidden />
          </motion.span>
          {item.dot ? <span className={styles.dot} aria-hidden /> : null}
          {active ? <span className={styles.here} aria-hidden /> : null}
        </Link>
      </motion.div>
    </li>
  );
}

/**
 * Teacher desk navigation — a floating glass dock pinned to the left edge of
 * the viewport, replacing the old left rail and top tab bar at every
 * breakpoint. Icons magnify as the cursor approaches (spring physics,
 * neighbours ride the same curve), groups are split by hairline dividers, and
 * a tooltip beside the hovered entry names it. Entries scroll vertically when
 * a full adviser load does not fit.
 */
export function TeacherGlassDock({
  groups,
  pathname,
  ariaLabel = "Teacher sections",
}: {
  groups: TeacherDockGroup[];
  pathname: string;
  ariaLabel?: string;
}) {
  const mouseY = useMotionValue(Number.POSITIVE_INFINITY);
  const reduce = usePrefersReducedMotion();
  const navRef = React.useRef<HTMLElement>(null);
  // Tooltip label + its centre offset from the dock's top edge.
  const [tip, setTip] = React.useState<{ label: string; top: number } | null>(
    null,
  );

  const showTip = React.useCallback((label: string, element: HTMLElement) => {
    const nav = navRef.current;
    if (!nav) return;
    const navRect = nav.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    setTip({ label, top: rect.top - navRect.top + rect.height / 2 });
  }, []);

  const hideTip = React.useCallback(() => setTip(null), []);

  const isActive = React.useCallback(
    (href: string) =>
      href === "/teacher/overview"
        ? pathname === href
        : pathname === href || pathname.startsWith(`${href}/`),
    [pathname],
  );

  // Flattened render list: hairline separators between groups, then tiles.
  const entries = React.useMemo(() => {
    const out: Array<
      { kind: "sep"; key: string } | { kind: "item"; key: string; item: TeacherDockItem }
    > = [];
    groups.forEach((group, groupIndex) => {
      if (groupIndex > 0) out.push({ kind: "sep", key: `sep-${groupIndex}` });
      group.items.forEach((item) => out.push({ kind: "item", key: item.href, item }));
    });
    return out;
  }, [groups]);

  // Stable signature of the links themselves (dots are ignored). The dock
  // remounts its list only when the advisory/workspace focus swaps the links,
  // which replays the staggered entrance instead of a hard pop-in.
  const navKey = React.useMemo(
    () => groups.map((group) => `${group.label}:${group.items.map((i) => i.href).join(",")}`).join("|"),
    [groups],
  );

  return (
    <div className={styles.anchor}>
      <motion.nav
        ref={navRef}
        className={styles.dock}
        aria-label={ariaLabel}
        onPointerMove={(event) => {
          if (!reduce) mouseY.set(event.clientY);
        }}
        onPointerLeave={() => {
          mouseY.set(Number.POSITIVE_INFINITY);
          hideTip();
        }}
        initial={reduce ? false : { opacity: 0, x: -28 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.6 }}
      >
        <div className={styles.row}>
          <ul className={styles.list} key={navKey}>
            {entries.map((entry, index) =>
              entry.kind === "sep" ? (
                <li
                  key={entry.key}
                  className={styles.sepItem}
                  style={{ "--tile-index": index } as React.CSSProperties}
                  aria-hidden
                />
              ) : (
                <DockTile
                  key={entry.key}
                  item={entry.item}
                  index={index}
                  active={isActive(entry.item.href)}
                  mouseY={mouseY}
                  reduce={reduce}
                  onEnter={showTip}
                  onLeave={hideTip}
                />
              ),
            )}
          </ul>
        </div>
        {tip ? (
          <span
            className={styles.tip}
            style={{ top: tip.top }}
            aria-hidden
          >
            {tip.label}
          </span>
        ) : null}
      </motion.nav>
    </div>
  );
}
