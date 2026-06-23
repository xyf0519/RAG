"use client";

import { useCallback, useEffect, useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";

import styles from "./border-glow.module.css";

const DEFAULT_COLORS = ["#f0faf8", "#8ee3d8", "#006c63"];
const GRADIENT_POSITIONS = ["80% 55%", "69% 34%", "8% 6%", "41% 38%", "86% 85%", "82% 18%", "51% 4%"];
const GRADIENT_KEYS = [
  "--gradient-one",
  "--gradient-two",
  "--gradient-three",
  "--gradient-four",
  "--gradient-five",
  "--gradient-six",
  "--gradient-seven",
] as const;
const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1];

type BorderGlowProps = {
  children: ReactNode;
  className?: string;
  edgeSensitivity?: number;
  glowColor?: string;
  backgroundColor?: string;
  borderRadius?: number;
  glowRadius?: number;
  glowIntensity?: number;
  coneSpread?: number;
  animated?: boolean;
  colors?: string[];
  fillOpacity?: number;
};

type GlowStyle = CSSProperties & Record<string, string | number>;

function parseHSL(hslStr: string) {
  const match = hslStr.match(/([\d.]+)\s*([\d.]+)%?\s*([\d.]+)%?/);
  if (!match) return { h: 174, s: 42, l: 52 };
  return { h: Number.parseFloat(match[1]), s: Number.parseFloat(match[2]), l: Number.parseFloat(match[3]) };
}

function buildGlowVars(glowColor: string, intensity: number) {
  const { h, s, l } = parseHSL(glowColor);
  const base = `${h}deg ${s}% ${l}%`;
  const opacities = [100, 60, 50, 40, 30, 20, 10];
  const keys = ["", "-60", "-50", "-40", "-30", "-20", "-10"];
  const vars: GlowStyle = {};
  for (let i = 0; i < opacities.length; i += 1) {
    vars[`--glow-color${keys[i]}`] = `hsl(${base} / ${Math.min(opacities[i] * intensity, 100)}%)`;
  }
  return vars;
}

function buildGradientVars(inputColors: string[]) {
  const colors = inputColors.length ? inputColors : DEFAULT_COLORS;
  const vars: GlowStyle = {};
  for (let i = 0; i < GRADIENT_KEYS.length; i += 1) {
    const color = colors[Math.min(COLOR_MAP[i], colors.length - 1)];
    vars[GRADIENT_KEYS[i]] = `radial-gradient(at ${GRADIENT_POSITIONS[i]}, ${color} 0px, transparent 50%)`;
  }
  vars["--gradient-base"] = `linear-gradient(${colors[0]} 0 100%)`;
  return vars;
}

function easeOutCubic(x: number) {
  return 1 - (1 - x) ** 3;
}

function easeInCubic(x: number) {
  return x * x * x;
}

function animateValue({
  start = 0,
  end = 100,
  duration = 1000,
  delay = 0,
  ease = easeOutCubic,
  onUpdate,
  onEnd,
}: {
  start?: number;
  end?: number;
  duration?: number;
  delay?: number;
  ease?: (value: number) => number;
  onUpdate: (value: number) => void;
  onEnd?: () => void;
}) {
  let frame = 0;
  const timeout = window.setTimeout(() => {
    const startedAt = performance.now();
    const tick = () => {
      const elapsed = performance.now() - startedAt;
      const t = Math.min(elapsed / duration, 1);
      onUpdate(start + (end - start) * ease(t));
      if (t < 1) {
        frame = window.requestAnimationFrame(tick);
      } else {
        onEnd?.();
      }
    };
    frame = window.requestAnimationFrame(tick);
  }, delay);

  return () => {
    window.clearTimeout(timeout);
    if (frame) window.cancelAnimationFrame(frame);
  };
}

export function BorderGlow({
  children,
  className = "",
  edgeSensitivity = 28,
  glowColor = "174 42 52",
  backgroundColor = "rgba(255,255,255,0.62)",
  borderRadius = 28,
  glowRadius = 30,
  glowIntensity = 0.76,
  coneSpread = 24,
  animated = false,
  colors = DEFAULT_COLORS,
  fillOpacity = 0.16,
}: BorderGlowProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  const getCenterOfElement = useCallback((element: HTMLElement) => {
    const { width, height } = element.getBoundingClientRect();
    return [width / 2, height / 2];
  }, []);

  const getEdgeProximity = useCallback(
    (element: HTMLElement, x: number, y: number) => {
      const [centerX, centerY] = getCenterOfElement(element);
      const dx = x - centerX;
      const dy = y - centerY;
      const kx = dx === 0 ? Infinity : centerX / Math.abs(dx);
      const ky = dy === 0 ? Infinity : centerY / Math.abs(dy);
      return Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
    },
    [getCenterOfElement],
  );

  const getCursorAngle = useCallback(
    (element: HTMLElement, x: number, y: number) => {
      const [centerX, centerY] = getCenterOfElement(element);
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx === 0 && dy === 0) return 0;
      const degrees = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
      return degrees < 0 ? degrees + 360 : degrees;
    },
    [getCenterOfElement],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const card = cardRef.current;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      card.style.setProperty("--edge-proximity", `${(getEdgeProximity(card, x, y) * 100).toFixed(3)}`);
      card.style.setProperty("--cursor-angle", `${getCursorAngle(card, x, y).toFixed(3)}deg`);
    },
    [getCursorAngle, getEdgeProximity],
  );

  useEffect(() => {
    if (!animated || !cardRef.current) return undefined;
    const card = cardRef.current;
    const angleStart = 110;
    const angleEnd = 465;
    const cleanups: Array<() => void> = [];
    card.classList.add(styles.sweepActive);
    card.style.setProperty("--cursor-angle", `${angleStart}deg`);

    cleanups.push(animateValue({ duration: 520, onUpdate: (value) => card.style.setProperty("--edge-proximity", String(value)) }));
    cleanups.push(
      animateValue({
        ease: easeInCubic,
        duration: 1400,
        end: 50,
        onUpdate: (value) => {
          card.style.setProperty("--cursor-angle", `${(angleEnd - angleStart) * (value / 100) + angleStart}deg`);
        },
      }),
    );
    cleanups.push(
      animateValue({
        delay: 1400,
        duration: 1800,
        start: 50,
        end: 100,
        onUpdate: (value) => {
          card.style.setProperty("--cursor-angle", `${(angleEnd - angleStart) * (value / 100) + angleStart}deg`);
        },
      }),
    );
    cleanups.push(
      animateValue({
        ease: easeInCubic,
        delay: 2200,
        duration: 1100,
        start: 100,
        end: 0,
        onUpdate: (value) => card.style.setProperty("--edge-proximity", String(value)),
        onEnd: () => card.classList.remove(styles.sweepActive),
      }),
    );

    return () => {
      cleanups.forEach((cleanup) => cleanup());
      card.classList.remove(styles.sweepActive);
    };
  }, [animated]);

  const style: GlowStyle = {
    "--card-bg": backgroundColor,
    "--edge-sensitivity": edgeSensitivity,
    "--border-radius": `${borderRadius}px`,
    "--glow-padding": `${glowRadius}px`,
    "--cone-spread": coneSpread,
    "--fill-opacity": fillOpacity,
    ...buildGlowVars(glowColor, glowIntensity),
    ...buildGradientVars(colors),
  };

  return (
    <div ref={cardRef} onPointerMove={handlePointerMove} className={`${styles.card} ${className}`} style={style}>
      <span className={styles.edgeLight} />
      <div className={styles.inner}>{children}</div>
    </div>
  );
}

export default BorderGlow;
