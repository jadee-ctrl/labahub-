import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, type AvatarChange } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import { Avatar, Banner, Button, Card, useConfirmAction } from "../components/ui";
import { prepareAvatar, type PreparedAvatar } from "../lib/avatar";

type Feedback = { kind: "success" | "error"; text: string } | null;

export default function Profile() {
  const { user, logout, saveProfile } = useAuth();
  const { orders } = useData();
  const navigate = useNavigate();
  const { ask, dialog } = useConfirmAction();
  const fileInput = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [picked, setPicked] = useState<PreparedAvatar | null>(null); // new picture, not saved yet
  const [removePicture, setRemovePicture] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [nameError, setNameError] = useState("");

  // Free the browser memory used by the preview when it changes or the page closes.
  useEffect(() => () => { if (picked) URL.revokeObjectURL(picked.previewUrl); }, [picked]);

  if (!user) return null;

  const myOrders = orders.filter((o) => o.staffId === user.id);
  const delivered = myOrders.filter((o) => o.status === "delivered").length;
  const hasPicture = !!picked || (!!user.avatarPath && !removePicture);
  const dirty =
    name.trim() !== user.name || phone.trim() !== user.phone || !!picked || removePicture;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFeedback(null);
    setPreparing(true);
    try {
      const prepared = await prepareAvatar(file);
      setPicked(prepared);
      setRemovePicture(false);
    } catch (e) {
      setFeedback({ kind: "error", text: e instanceof Error ? e.message : "Could not use that picture." });
    } finally {
      setPreparing(false);
      if (fileInput.current) fileInput.current.value = ""; // lets the same file be chosen again
    }
  };

  const handleSave = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) return setNameError("Please enter your name.");
    setNameError("");
    setSaving(true);
    setFeedback(null);
    const avatar: AvatarChange = picked ? { type: "replace", blob: picked.blob } : removePicture ? { type: "remove" } : { type: "keep" };
    const result = await saveProfile({ name, phone, avatar });
    setSaving(false);
    if (result.ok) {
      setPicked(null);
      setRemovePicture(false);
      setFeedback({ kind: "success", text: "Your profile was updated." });
    } else {
      // Everything stays on the form, so they can simply press Save again.
      setFeedback({ kind: "error", text: result.error ?? "Could not save your profile." });
    }
  };

  const reset = () => {
    setName(user.name);
    setPhone(user.phone);
    setPicked(null);
    setRemovePicture(false);
    setNameError("");
    setFeedback(null);
  };

  const pictureInput = (
    <input
      ref={fileInput}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      className="visually-hidden"
      aria-label="Choose a profile picture"
      onChange={(e) => void onFile(e.target.files?.[0])}
    />
  );

  return (
    <>
      <h1 className="page-title">Profile</h1>
      {feedback ? (
        <div className="profile-banner">
          <Banner
            kind={feedback.kind}
            actionLabel={feedback.kind === "error" && dirty ? "Retry" : undefined}
            onAction={feedback.kind === "error" && dirty ? () => void handleSave() : undefined}
            onDismiss={() => setFeedback(null)}
          >
            {feedback.text}
          </Banner>
        </div>
      ) : null}

      <div className="profile-layout">
        {/* Left: who you are, your picture and your numbers */}
        <Card className="profile-side">
          <Avatar name={name || user.name} path={removePicture ? null : user.avatarPath} previewUrl={picked?.previewUrl} size={112} />
          <div className="profile-name">{user.name || user.email}</div>
          <div className="profile-role">Staff account</div>
          <div className="avatar-buttons">
            <Button
              label={hasPicture ? "Replace picture" : "Upload picture"}
              variant="secondary"
              fullWidth={false}
              loading={preparing}
              disabled={saving}
              onClick={() => fileInput.current?.click()}
            />
            {hasPicture ? (
              <Button
                label="Remove"
                variant="ghost"
                fullWidth={false}
                disabled={saving || preparing}
                onClick={() => {
                  setPicked(null);
                  setRemovePicture(true);
                }}
              />
            ) : null}
          </div>
          {pictureInput}
          <div className="field-hint">
            {picked ? "New picture selected. Press Save changes to keep it." : removePicture ? "The picture will be removed when you save." : "JPG, PNG or WebP. It is cropped to a square."}
          </div>

          <div className="profile-stats">
            <div>
              <div className="stat-value">{myOrders.length}</div>
              <div className="stat-label">Jobs handled</div>
            </div>
            <div>
              <div className="stat-value">{delivered}</div>
              <div className="stat-label">Completed</div>
            </div>
          </div>

          {/* Only shown on narrow screens, where the sidebar (and its log out icon) is replaced by bottom tabs. */}
          <div className="profile-logout">
            <Button
              label="Log out"
              variant="outline"
              onClick={() =>
                ask({
                  title: "Log out",
                  message: "Are you sure you want to log out?",
                  confirmLabel: "Log out",
                  run: async () => {
                    await logout();
                    navigate("/login", { replace: true });
                  },
                })
              }
            />
          </div>
        </Card>

        {/* Right: the details you can edit */}
        <Card>
          <form onSubmit={handleSave} noValidate>
            <div className="section-title">Personal details</div>
            <div className="section-subtitle profile-form-sub">Update your name and phone number.</div>

            <div className="field-row">
              <label className="field">
                <span className="field-label">Full name</span>
                <input
                  className={`input${nameError ? " input-error" : ""}`}
                  value={name}
                  maxLength={80}
                  autoComplete="name"
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={!!nameError}
                />
                {nameError ? <span className="field-error">{nameError}</span> : null}
              </label>
              <label className="field">
                <span className="field-label">Phone</span>
                <input className="input" value={phone} maxLength={30} autoComplete="tel" inputMode="tel" onChange={(e) => setPhone(e.target.value)} />
              </label>
            </div>
            <div className="field">
              <span className="field-label">Email</span>
              <input className="input input-readonly" value={user.email} readOnly aria-readonly="true" />
              <span className="field-hint">Your email and role can't be changed here.</span>
            </div>

            <div className="form-actions profile-actions">
              <Button label="Discard" variant="ghost" fullWidth={false} onClick={reset} disabled={saving || !dirty} />
              <Button type="submit" label="Save changes" fullWidth={false} loading={saving} disabled={!dirty || preparing} />
            </div>
          </form>
        </Card>
      </div>
      {dialog}
    </>
  );
}