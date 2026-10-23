// Same palette as the mobile app's constants/theme.ts
export const colors = {
  primary: "#2F6690",
  primaryDark: "#1E4E70",
  primaryLight: "#DCEBF5",
  accent: "#3A9BDC",
  background: "#F6F8FA",
  surface: "#FFFFFF",
  border: "#E4E9EE",
  text: "#1A2530",
  textMuted: "#6B7B8C",
  textFaint: "#9AA7B3",
  success: "#2E9E5B",
  successLight: "#E3F6EA",
  warning: "#C88A1B",
  warningLight: "#FBF0DA",
  danger: "#D14343",
  dangerLight: "#FBE6E6",
  info: "#3A9BDC",
  infoLight: "#E4F2FC",
};

export const statusColors: Record<string, { fg: string; bg: string; label: string }> = {
  pending: { fg: colors.warning, bg: colors.warningLight, label: "Pending" },
  confirmed: { fg: colors.info, bg: colors.infoLight, label: "Confirmed" },
  picked_up: { fg: colors.info, bg: colors.infoLight, label: "Picked Up" },
  washing: { fg: colors.primary, bg: colors.primaryLight, label: "Washing" },
  ready: { fg: colors.success, bg: colors.successLight, label: "Ready" },
  out_for_delivery: { fg: colors.primary, bg: colors.primaryLight, label: "Out for Delivery" },
  delivered: { fg: colors.success, bg: colors.successLight, label: "Delivered" },
  cancelled: { fg: colors.danger, bg: colors.dangerLight, label: "Cancelled" },
};

export const ORDER_STEPS: string[] = [
  "pending",
  "confirmed",
  "picked_up",
  "washing",
  "ready",
  "out_for_delivery",
  "delivered",
];
