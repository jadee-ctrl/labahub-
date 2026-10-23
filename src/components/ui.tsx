import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { OrderStatus } from "../types";
import { useAvatarUrl } from "../lib/avatar";
import { colors, statusColors } from "../theme";

export function Card({ children, style, className = "" }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <div className={`card ${className}`} style={style}>
      {children}
    </div>
  );
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="section-header">
      <div style={{ flex: 1 }}>
        <div className="section-title">{title}</div>
        {subtitle ? <div className="section-subtitle">{subtitle}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const meta = statusColors[status] ?? { fg: colors.textMuted, bg: colors.border, label: status };
  return (
    <span className="badge" style={{ background: meta.bg, color: meta.fg }}>
      {meta.label}
    </span>
  );
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {subtitle ? <div className="empty-subtitle">{subtitle}</div> : null}
    </div>
  );
}

export function Divider() {
  return <div className="divider" />;
}

type Variant = "primary" | "secondary" | "outline" | "danger" | "ghost";

export function Button({
  label,
  onClick,
  variant = "primary",
  disabled,
  loading,
  fullWidth = true,
  type = "button",
  style,
}: {
  label: string;
  onClick?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  type?: "button" | "submit";
  style?: CSSProperties;
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant}${fullWidth ? " btn-full" : ""}`}
      onClick={onClick}
      disabled={disabled || loading}
      style={style}
    >
      {loading ? <span className="spinner" aria-label="Loading" /> : label}
    </button>
  );
}

export function ChipGroup({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <div className="chip-row">
      {options.map((opt) => (
        <button key={opt} type="button" className={`chip${opt === value ? " chip-selected" : ""}`} onClick={() => onChange(opt)}>
          {opt}
        </button>
      ))}
    </div>
  );
}

// Replaces the phone's Alert.alert(...) confirmation pop-ups.
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);
  return (
    <div className="modal-backdrop" onClick={() => !busy && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        <div className="modal-message">{message}</div>
        <div className="modal-actions">
          <Button label="Cancel" variant="ghost" fullWidth={false} onClick={onCancel} disabled={busy} />
          <Button label={confirmLabel} fullWidth={false} onClick={onConfirm} loading={busy} />
        </div>
      </div>
    </div>
  );
}

// Helper for "confirm, then run an action, show any error" flows.
export function useConfirmAction() {
  const [pending, setPending] = useState<{ title: string; message: string; confirmLabel: string; run: () => Promise<void> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = (p: { title: string; message: string; confirmLabel: string; run: () => Promise<void> }) => {
    setError(null);
    setPending(p);
  };

  const dialog = pending ? (
    <ConfirmDialog
      title={pending.title}
      message={pending.message}
      confirmLabel={pending.confirmLabel}
      busy={busy}
      onCancel={() => setPending(null)}
      onConfirm={async () => {
        setBusy(true);
        try {
          await pending.run();
          setPending(null);
        } catch (e) {
          setPending(null);
          setError(e instanceof Error ? e.message : "Something went wrong.");
        } finally {
          setBusy(false);
        }
      }}
    />
  ) : null;

  const errorBanner = error ? (
    <div className="error-banner" role="alert">
      {error}
      <button className="error-close" onClick={() => setError(null)} aria-label="Dismiss">
        ×
      </button>
    </div>
  ) : null;

  return { ask, dialog, errorBanner };
}

export function LoadingScreen({ text = "Loading…" }: { text?: string }) {
  return (
    <div className="splash">
      <div className="splash-dot" />
      <div className="splash-text">LabaHub</div>
      <div className="splash-sub">{text}</div>
    </div>
  );
}

// Shows the person's picture, or a default avatar (their first initial) when there is none.
// `previewUrl` is used for a freshly chosen picture that hasn't been saved yet.
export function Avatar({
  name,
  path,
  previewUrl,
  size = 40,
}: {
  name: string;
  path?: string | null;
  previewUrl?: string | null;
  size?: number;
}) {
  const signed = useAvatarUrl(previewUrl ? null : path);
  const [failed, setFailed] = useState<string | null>(null);
  const src = previewUrl ?? signed;
  const showImage = !!src && failed !== src;
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }} role="img" aria-label={`${name || "User"} profile picture`}>
      {showImage ? <img src={src!} alt="" onError={() => setFailed(src)} /> : (name || "?").trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function Banner({
  kind,
  children,
  actionLabel,
  onAction,
  onDismiss,
}: {
  kind: "success" | "error" | "info";
  children: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className={`banner banner-${kind}`} role={kind === "error" ? "alert" : "status"}>
      <span style={{ flex: 1 }}>{children}</span>
      {actionLabel && onAction ? (
        <button type="button" className="banner-action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
      {onDismiss ? (
        <button type="button" className="banner-close" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      ) : null}
    </div>
  );
}
