import { useState, type FormEvent } from "react";
import { useData, type ServiceInput } from "../context/DataContext";
import { Banner, Button, Card, EmptyState, useConfirmAction } from "../components/ui";
import { SERVICE_ICONS, autoIcon, iconFor } from "../serviceIcons";
import { formatPeso } from "../format";
import type { Service } from "../types";

type Draft = { id?: string; name: string; description: string; price: string; unit: "per kg" | "per item"; active: boolean; icon?: string };
const blank = (): Draft => ({ name: "", description: "", price: "", unit: "per kg", active: true });
const toDraft = (s: Service): Draft => ({ id: s.id, name: s.name, description: s.description, price: String(s.price), unit: s.unit === "per item" ? "per item" : "per kg", active: s.active, icon: s.icon });

/** Checks the form the same way the database does, so most mistakes are caught before saving. */
export function validateService(d: Draft): { input?: ServiceInput; errors: Partial<Record<"name" | "description" | "price", string>> } {
  const errors: Partial<Record<"name" | "description" | "price", string>> = {};
  const name = d.name.trim();
  if (name.length < 2 || name.length > 60) errors.name = "Name must be 2 to 60 characters.";
  if (d.description.trim().length > 200) errors.description = "Keep the description under 200 characters.";
  const price = Number(d.price.replace(/,/g, ""));
  if (!d.price.trim() || !Number.isFinite(price) || price < 0 || price > 100000 || Math.round(price * 100) !== price * 100) {
    errors.price = "Enter a price from 0 to 100,000 (up to 2 decimals).";
  }
  if (Object.keys(errors).length) return { errors };
  return { errors, input: { id: d.id, name, description: d.description.trim(), price, unit: d.unit, active: d.active } };
}

// No picking: the icon comes from the service name (e.g. "Shoe Cleaning" -> shoe), and is never shared.
function AutoIconPreview({ name, usedIcons, current }: { name: string; usedIcons: string[]; current?: { icon?: string; name: string } }) {
  const icon = autoIcon(name, usedIcons, current);
  const Icon = iconFor(icon);
  const label = SERVICE_ICONS.find((i) => i.name === icon)?.label;
  return (
    <div className="auto-icon">
      <span className="service-icon" aria-hidden="true">
        <Icon size={20} />
      </span>
      <span>
        <span className="field-label">Icon in the app{label ? `: ${label}` : ""}</span>
        <span className="field-hint">
          {!icon
            ? "All icons are already used. Delete a service you no longer offer first."
            : "Picked automatically from the service name. Each service gets its own icon."}
        </span>
      </span>
    </div>
  );
}

function ServiceForm({ initial, usedIcons, onCancel, onSaved }: { initial: Draft; usedIcons: string[]; onCancel: () => void; onSaved: (msg: string) => void }) {
  const { saveService } = useData();
  const [d, setD] = useState<Draft>(initial);
  const [errors, setErrors] = useState<ReturnType<typeof validateService>["errors"]>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const isNew = !initial.id;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = validateService(d);
    setErrors(v.errors);
    if (!v.input) return;
    setSaving(true);
    setServerError("");
    try {
      await saveService(v.input);
      onSaved(isNew ? `Added “${v.input.name}”.` : `Saved “${v.input.name}”.`);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Could not save the service.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="service-form" onSubmit={submit} noValidate>
      <div className="section-title">{isNew ? "New service" : `Edit ${initial.name}`}</div>
      {serverError ? <Banner kind="error">{serverError}</Banner> : null}
      <div className="field-row">
        <label className="field">
          <span className="field-label">Name</span>
          <input className={`input${errors.name ? " input-error" : ""}`} value={d.name} maxLength={60} onChange={(e) => setD({ ...d, name: e.target.value })} />
          {errors.name ? <span className="field-error">{errors.name}</span> : null}
        </label>
        <div className="field-row service-price-row">
          <label className="field">
            <span className="field-label">Price (₱)</span>
            <input className={`input${errors.price ? " input-error" : ""}`} inputMode="decimal" value={d.price} onChange={(e) => setD({ ...d, price: e.target.value })} />
            {errors.price ? <span className="field-error">{errors.price}</span> : null}
          </label>
          <label className="field">
            <span className="field-label">Charged</span>
            <select className="input" value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value as Draft["unit"] })}>
              <option value="per kg">per kg</option>
              <option value="per item">per item</option>
            </select>
          </label>
        </div>
      </div>
      <label className="field">
        <span className="field-label">Description</span>
        <input className={`input${errors.description ? " input-error" : ""}`} value={d.description} maxLength={200} onChange={(e) => setD({ ...d, description: e.target.value })} />
        {errors.description ? <span className="field-error">{errors.description}</span> : null}
      </label>
      <AutoIconPreview name={d.name} usedIcons={usedIcons} current={initial.id ? { icon: initial.icon, name: initial.name } : undefined} />
      <label className="service-active">
        <input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} />
        <span>
          <strong>Customers can book this</strong>
          <span className="field-hint">Untick to hide it from the app. Old orders keep their price either way.</span>
        </span>
      </label>
      <div className="form-actions">
        <Button label="Cancel" variant="ghost" fullWidth={false} onClick={onCancel} disabled={saving} />
        <Button type="submit" label={isNew ? "Add service" : "Save changes"} fullWidth={false} loading={saving} />
      </div>
    </form>
  );
}

export default function Services() {
  const { services, loading, deleteService } = useData();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [done, setDone] = useState("");
  const { ask, dialog, errorBanner } = useConfirmAction();
  const usedIcons = services.map((x) => x.icon).filter((x): x is string => !!x);
  const remove = (svc: Service) =>
    ask({
      title: "Delete service",
      message: `Delete "${svc.name}"? Customers won't be able to book it any more. Past orders keep their service and price.`,
      confirmLabel: "Delete",
      run: async () => {
        const r = await deleteService(svc.id);
        if (editing?.id === svc.id) setEditing(null);
        setDone(r === "archived" ? `Deleted "${svc.name}". Its past orders still show it.` : `Deleted "${svc.name}".`);
      },
    });
  const sorted = [...services].sort((a, b) => Number(b.active) - Number(a.active) || a.price - b.price);

  return (
    <>
      <div className="report-head">
        <div>
          <h1 className="page-title">Services</h1>
          <p className="page-sub">The price list customers see when booking.</p>
        </div>
        {!editing ? (
          <div className="report-actions">
            <Button label="Add service" fullWidth={false} onClick={() => { setDone(""); setEditing(blank()); }} />
          </div>
        ) : null}
      </div>
      {errorBanner}
      {done ? <Banner kind="success" onDismiss={() => setDone("")}>{done}</Banner> : null}

      {editing ? (
        <Card style={{ marginBottom: 20 }}>
          <ServiceForm key={editing.id ?? "new"} initial={editing} usedIcons={usedIcons} onCancel={() => setEditing(null)} onSaved={(m) => { setEditing(null); setDone(m); }} />
        </Card>
      ) : null}

      {sorted.length === 0 ? (
        <Card>
          <EmptyState title={loading ? "Loading…" : "No services yet"} subtitle={loading ? undefined : "Add your first service."} />
        </Card>
      ) : (
        <Card className="slot-card">
          {sorted.map((s) => {
            const Icon = iconFor(s.icon);
            return (
            <div key={s.id} className={`service-row${s.active ? "" : " service-off"}`}>
              <span className="service-icon" aria-hidden="true">
                <Icon size={20} />
              </span>
              <div className="service-main">
                <div className="service-name">
                  {s.name} {!s.active ? <span className="badge service-off-badge">Hidden</span> : null}
                </div>
                {s.description ? <div className="service-desc">{s.description}</div> : null}
              </div>
              <div className="service-price">
                {formatPeso(s.price)} <span>{s.unit}</span>
              </div>
              <div className="service-actions">
                <Button label="Edit" variant="secondary" fullWidth={false} onClick={() => { setDone(""); setEditing(toDraft(s)); }} />
                <Button label="Delete" variant="ghost" fullWidth={false} onClick={() => { setDone(""); remove(s); }} />
              </div>
            </div>
            );
          })}
        </Card>
      )}
      <p className="pay-note">Changing a price only affects new bookings. Deleting a service removes it from the app; past orders keep their service and price.</p>
      {dialog}
    </>
  );
}