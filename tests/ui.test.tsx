import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// ---- fakes for the two contexts (so no network is needed) ----
const auth: any = { user: null, logout: vi.fn(), saveProfile: vi.fn() };
const data: any = { newOrderCount: 0, loading: false, error: null, unreadCountFor: () => 0, orders: [] };
vi.mock("../src/context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../src/context/DataContext", async (orig) => ({ ...(await orig<any>()), useData: () => data }));
vi.mock("../src/lib/avatar", async (orig) => ({ ...(await orig<any>()), useAvatarUrl: () => null }));

import { Layout } from "../src/components/Layout";
import Profile from "../src/pages/Profile";
import { needsAttention } from "../src/context/DataContext";

const staff = (over = {}) => ({ id: "s1", name: "Maria Santos", email: "maria@shop.ph", phone: "0917", role: "staff", createdAt: "", ...over });
const renderLayout = () =>
  render(
    <MemoryRouter initialEntries={["/orders"]}>
      <Routes><Route element={<Layout />}><Route path="/orders" element={<div>orders page</div>} /><Route path="/profile" element={<div>profile page</div>} /></Route></Routes>
    </MemoryRouter>
  );
const ordersLink = () => screen.getByRole("link", { name: /^Orders/ });

beforeEach(() => { cleanup(); auth.user = staff(); Object.assign(data, { newOrderCount: 0, loading: false, error: null }); auth.saveProfile.mockReset(); });

describe("Orders badge", () => {
  it("shows the real count beside Orders with an accessible label", () => {
    data.newOrderCount = 3; renderLayout();
    expect(ordersLink().getAttribute("aria-label")).toBe("Orders, 3 new orders need attention");
    expect(within(ordersLink()).getAllByText("3").length).toBeGreaterThan(0);
    expect(document.title).toBe("(3) LabaHub Staff");
  });
  it("singular wording for 1", () => { data.newOrderCount = 1; renderLayout(); expect(ordersLink().getAttribute("aria-label")).toBe("Orders, 1 new order needs attention"); });
  it("is hidden at zero", () => { renderLayout(); expect(ordersLink().getAttribute("aria-label")).toBe("Orders"); expect(document.querySelector(".pill-badge")).toBeNull(); expect(document.title).toBe("LabaHub Staff"); });
  it("is hidden while loading", () => { data.newOrderCount = 5; data.loading = true; renderLayout(); expect(document.querySelector(".pill-badge")).toBeNull(); });
  it("shows '!' (not a number) when orders could not be loaded", () => { data.newOrderCount = 5; data.error = "boom"; renderLayout(); expect(document.querySelector(".pill-badge")!.textContent).toBe("!"); expect(document.title).toBe("LabaHub Staff"); });
  it("caps at 99+", () => { data.newOrderCount = 250; renderLayout(); expect(document.querySelector(".pill-badge")!.textContent).toBe("99+"); });
  it("Orders link still navigates", async () => { renderLayout(); expect(screen.getByText("orders page")).toBeTruthy(); });
  it("counting rule: pending + unassigned only", () => {
    expect(needsAttention({ status: "pending", staffId: undefined } as any)).toBe(true);
    expect(needsAttention({ status: "pending", staffId: "x" } as any)).toBe(false);
    for (const s of ["confirmed", "picked_up", "washing", "ready", "out_for_delivery", "delivered", "cancelled"]) expect(needsAttention({ status: s, staffId: undefined } as any)).toBe(false);
  });
});

describe("Sidebar profile panel", () => {
  it("shows the signed-in staff member's real name and role, no hardcoded identity", () => {
    renderLayout();
    const card = screen.getByTitle("View and edit your profile");
    expect(within(card).getByText("Maria Santos")).toBeTruthy();
    expect(within(card).getByText("Staff")).toBeTruthy();
    expect(within(card).getByRole("img", { name: "Maria Santos profile picture" }).textContent).toBe("M"); // default avatar
  });
  it("updates when the profile changes", () => {
    const { unmount } = renderLayout(); unmount(); auth.user = staff({ name: "Jose Rizal" }); renderLayout();
    expect(screen.getByText("Jose Rizal")).toBeTruthy(); expect(screen.queryByText("Maria Santos")).toBeNull();
  });
  it("falls back to email when name is empty; long names render in a truncating element", () => {
    auth.user = staff({ name: "" }); renderLayout(); expect(screen.getAllByText("maria@shop.ph").length).toBeGreaterThan(0); cleanup();
    auth.user = staff({ name: "A".repeat(80) }); renderLayout(); expect(document.querySelector(".account-name")!.textContent!.length).toBe(80);
  });
  it("has Edit profile and Log out actions; logout asks for confirmation", async () => {
    const u = userEvent.setup(); renderLayout();
    await u.click(screen.getByRole("button", { name: /Edit profile/ })); expect(screen.getByText("profile page")).toBeTruthy();
  });
  it("Log out shows a confirm dialog then calls logout", async () => {
    const u = userEvent.setup(); renderLayout();
    await u.click(screen.getByRole("button", { name: /Log out/ }));
    const dialog = screen.getByRole("dialog"); expect(auth.logout).not.toHaveBeenCalled();
    await u.click(within(dialog).getByRole("button", { name: "Log out" })); await waitFor(() => expect(auth.logout).toHaveBeenCalled());
  });
});

describe("Profile page", () => {
  const renderProfile = () => render(<MemoryRouter><Profile /></MemoryRouter>);
  it("loads real values; Save is disabled until something changes; email is read-only", () => {
    renderProfile();
    expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe("Maria Santos");
    expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(true);
    const email = screen.getAllByDisplayValue("maria@shop.ph")[0] as HTMLInputElement; expect(email.readOnly).toBe(true);
    expect(screen.queryByLabelText(/role/i)).toBeNull();
  });
  it("saves changed name and shows success", async () => {
    auth.saveProfile.mockResolvedValue({ ok: true }); const u = userEvent.setup(); renderProfile();
    const name = screen.getByLabelText("Full name"); await u.clear(name); await u.type(name, "Maria S. Cruz");
    await u.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(auth.saveProfile).toHaveBeenCalledWith({ name: "Maria S. Cruz", phone: "0917", avatar: { type: "keep" } }));
    expect(await screen.findByText("Your profile was updated.")).toBeTruthy();
  });
  it("rejects an empty name without calling the server", async () => {
    const u = userEvent.setup(); renderProfile(); await u.clear(screen.getByLabelText("Full name")); await u.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Please enter your name.")).toBeTruthy(); expect(auth.saveProfile).not.toHaveBeenCalled();
  });
  it("shows an error and a working Retry when saving fails", async () => {
    auth.saveProfile.mockResolvedValueOnce({ ok: false, error: "Network down" }).mockResolvedValueOnce({ ok: true });
    const u = userEvent.setup(); renderProfile(); const name = screen.getByLabelText("Full name"); await u.type(name, "x");
    await u.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Network down")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Retry" })); await waitFor(() => expect(auth.saveProfile).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Your profile was updated.")).toBeTruthy();
  });
  it("rejects a non-image file with a clear message (no upload attempted)", async () => {
    const u = userEvent.setup({ applyAccept: false }); renderProfile();
    const input = screen.getByLabelText("Choose a profile picture") as HTMLInputElement;
    await u.upload(input, new File(["hello"], "notes.txt", { type: "text/plain" }));
    expect(await screen.findByText("Please choose a JPG, PNG or WebP picture.")).toBeTruthy(); expect(auth.saveProfile).not.toHaveBeenCalled();
  });
  it("rejects a huge file", async () => {
    const u = userEvent.setup(); renderProfile(); const input = screen.getByLabelText("Choose a profile picture") as HTMLInputElement;
    const big = new File(["x"], "big.png", { type: "image/png" }); Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    await u.upload(input, big); expect(await screen.findByText("That picture is too big. Please choose one under 10 MB.")).toBeTruthy();
  });
  it("Remove picture is offered only when there is one, and saves {type:'remove'}", async () => {
    auth.user = staff({ avatarPath: "s1/avatar-1.jpg" }); auth.saveProfile.mockResolvedValue({ ok: true });
    const u = userEvent.setup(); renderProfile(); expect(screen.getByRole("button", { name: "Replace picture" })).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Remove" }));
    await u.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(auth.saveProfile).toHaveBeenCalledWith(expect.objectContaining({ avatar: { type: "remove" } })));
  });
  it("without a picture it offers Upload and no Remove", () => { renderProfile(); expect(screen.getByRole("button", { name: "Upload picture" })).toBeTruthy(); expect(screen.queryByRole("button", { name: "Remove" })).toBeNull(); });
});
