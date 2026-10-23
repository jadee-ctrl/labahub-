export type Role = "customer" | "staff";

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  address?: string;
  avatarPath?: string;
  createdAt: string;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  unit: string;
  /** Switched-off services are hidden from customers but kept for old orders. */
  active: boolean;
  /** Ionicons name shown in the customer app, e.g. "shirt-outline". */
  icon?: string;
}

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "picked_up"
  | "washing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

export interface ProgressEvent {
  status: OrderStatus;
  timestamp: string;
  note?: string;
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  address: string;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  serviceUnit: string;
  estimatedWeightKg: number;
  instructions?: string;
  pickupDate: string;
  pickupSlot: string;
  deliverySlot: string;
  status: OrderStatus;
  staffId?: string;
  staffName?: string;
  // "PayPal" only appears on old orders from the earlier PayPal Sandbox test.
  paymentMethod: "COD" | "PayMongo" | "PayPal";
  paymentStatus: "unpaid" | "paid";
  /** Online payment progress from PayMongo (only for online orders). */
  paymongoStatus?: "pending" | "paid" | "failed" | "cancelled" | "expired";
  paidAt?: string;
  /** Real weight (kg) or item count recorded by staff. */
  actualQuantity?: number;
  weighedAt?: string;
  refundId?: string;
  refundStatus?: "pending" | "processing" | "refunding" | "succeeded" | "failed";
  refundAmount?: number;
  /** QR Ph refunds: the link the customer opens to claim the money. */
  refundTransferLink?: string;
  refundedAt?: string;
  /** What the customer first paid (online, or cash on delivery). */
  paidAmount?: number;
  /** Extra paid after re-weighing (heavier than booked). */
  balancePaidAmount?: number;
  balanceMethod?: "cash" | "online";
  balanceStatus?: "pending" | "paid" | "failed" | "cancelled" | "expired";
  /** Refund of the overpaid difference (weighed lighter than paid). */
  adjustRefundId?: string;
  adjustRefundStatus?: "pending" | "processing" | "refunding" | "succeeded" | "failed";
  adjustRefundAmount?: number;
  adjustRefundedAt?: string;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
  progress: ProgressEvent[];
}

export type NotificationType = "order_update" | "assignment" | "system" | "payment";

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  orderId?: string;
  read: boolean;
  createdAt: string;
}
