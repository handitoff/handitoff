import { useEffect, useRef, useState } from "react";

export type ReceiveName = { name: string; color: string };

// Lowercase, descender-free names so the vertical roll stays optically centered.
export const RECEIVE_NAMES: ReceiveName[] = [
  { name: "peter", color: "#34d399" },
  { name: "maria", color: "#f0abfc" },
  { name: "alex", color: "#38bdf8" },
  { name: "noah", color: "#fbbf24" },
  { name: "lena", color: "#fb7185" },
  { name: "sam", color: "#a78bfa" },
];

const TRANSITION_MS = 600;

export type CyclingState = { index: number; animate: boolean };

// Shared cycling state so a URL and its matching status line roll in sync.
// `index` runs 0..RECEIVE_NAMES.length, where the final step lands on a clone of
// the first name and then snaps back with `animate: false` for a seamless loop.
export function useCyclingName(intervalMs = 2200): CyclingState {
  const [index, setIndex] = useState(0);
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    const id = window.setInterval(() => {
      setAnimate(true);
      setIndex((prev) => prev + 1);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  useEffect(() => {
    if (index !== RECEIVE_NAMES.length) return;
    const id = window.setTimeout(() => {
      setAnimate(false);
      setIndex(0);
    }, TRANSITION_MS);
    return () => window.clearTimeout(id);
  }, [index]);

  return { index, animate };
}

// Apple-style vertical selection roll. The container width tracks the current
// name (animated) so trailing text like "is online" stays flush against it.
export function NameRoll({
  state,
  colored = false,
  capitalize = false,
}: {
  state: CyclingState;
  colored?: boolean;
  capitalize?: boolean;
}) {
  const { index, animate } = state;
  const rollRef = useRef<HTMLSpanElement>(null);
  const [widths, setWidths] = useState<number[]>([]);

  // First name is cloned at the end to make the wrap-around seamless.
  const items = [...RECEIVE_NAMES, RECEIVE_NAMES[0]];

  useEffect(() => {
    const measure = () => {
      if (!rollRef.current) return;
      const children = Array.from(rollRef.current.children) as HTMLElement[];
      setWidths(children.map((child) => child.getBoundingClientRect().width));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [capitalize]);

  const width = widths.length > index ? widths[index] : undefined;
  const noTransition = animate ? undefined : "none";

  return (
    <span className="ht-name" style={{ width, transition: noTransition }}>
      <span
        ref={rollRef}
        className="ht-name-roll"
        style={{ transform: `translateY(calc(${index} * -1lh))`, transition: noTransition }}
      >
        {items.map((entry, i) => (
          <span
            key={i}
            className="ht-name-item"
            style={{
              color: colored ? entry.color : undefined,
              textTransform: capitalize ? "capitalize" : undefined,
            }}
          >
            {entry.name}
          </span>
        ))}
      </span>
    </span>
  );
}
