import type { ReactNode } from "react";
import styles from "./primitives.module.css";

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className={styles.eyebrow}>{children}</p>;
}

export function Panel({
  eyebrow,
  title,
  children,
  className,
}: {
  eyebrow?: string;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${styles.panel} ${className ?? ""}`}>
      {(eyebrow || title) && (
        <header className={styles.panelHead}>
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          {title && <h2 className={styles.panelTitle}>{title}</h2>}
        </header>
      )}
      {children}
    </section>
  );
}

export function EVReadout({
  label,
  value,
  unit,
  tone = "data",
  digits = 2,
}: {
  label: string;
  value: number;
  unit?: string;
  tone?: "data" | "optimal";
  digits?: number;
}) {
  const toneClass = tone === "optimal" ? styles.toneOptimal : styles.toneData;
  const shown = Number.isFinite(value) ? value.toFixed(digits) : "—";
  return (
    <div className={styles.readout}>
      <span className={styles.readoutLabel}>{label}</span>
      <span className={`${styles.readoutValue} ${toneClass}`}>
        {shown}
        {unit && <span className={styles.readoutUnit}>{unit}</span>}
      </span>
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "default",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary";
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className={`${styles.btn} ${variant === "primary" ? styles.btnPrimary : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
