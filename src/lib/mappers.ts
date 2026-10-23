import type { AppNotification, Order, OrderStatus, ProgressEvent, Service, User } from "../types";

// Database columns are snake_case; the screens use camelCase. These convert between them.
/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapProfile(p: any, fallbackEmail = ""): User {
  return {
    id: p.id,
    name: p.name ?? "",
    email: p.email || fallbackEmail,
    phone: p.phone ?? "",
    role: p.role,
    address: p.address ?? undefined,
    avatarPath: p.avatar_path ?? undefined,
    createdAt: p.created_at,
  };
}

function mapPaymentMethod(value: any): Order["paymentMethod"] {
  const v = String(value ?? "").toUpperCase();
  if (v === "PAYMONGO") return "PayMongo";
  if (v === "PAYPAL") return "PayPal";
  return "COD";
}

const num = (v: any): number | undefined => (v == null ? undefined : Number(v));

export function mapProgress(p: any): ProgressEvent {
  return { status: p.status as OrderStatus, timestamp: p.created_at, note: p.note ?? undefined };
}

export function mapOrder(o: any, progress: ProgressEvent[] = []): Order {
  return {
    id: o.id,
    customerId: o.customer_id,
    customerName: o.customer_name,
    customerPhone: o.customer_phone ?? "",
    address: o.address,
    serviceId: o.service_id,
    serviceName: o.service_name,
    servicePrice: Number(o.service_price),
    serviceUnit: o.service_unit,
    estimatedWeightKg: Number(o.estimated_weight_kg),
    instructions: o.instructions ?? undefined,
    pickupDate: o.pickup_date,
    pickupSlot: o.pickup_slot ?? "",
    deliverySlot: o.delivery_slot ?? "",
    status: o.status as OrderStatus,
    staffId: o.staff_id ?? undefined,
    staffName: o.staff_name ?? undefined,
    paymentMethod: mapPaymentMethod(o.payment_method),
    paymentStatus: o.payment_status,
    paymongoStatus: o.paymongo_status ?? undefined,
    paidAt: o.paid_at ?? undefined,
    actualQuantity: o.actual_quantity == null ? undefined : Number(o.actual_quantity),
    weighedAt: o.weighed_at ?? undefined,
    refundId: o.refund_id ?? undefined,
    refundStatus: o.refund_status ?? undefined,
    refundAmount: o.refund_amount == null ? undefined : Number(o.refund_amount),
    refundTransferLink: o.refund_transfer_link ?? undefined,
    refundedAt: o.refunded_at ?? undefined,
    paidAmount: num(o.paid_amount),
    balancePaidAmount: num(o.balance_paid_amount),
    balanceMethod: o.balance_method ?? undefined,
    balanceStatus: o.balance_status ?? undefined,
    adjustRefundId: o.adjust_refund_id ?? undefined,
    adjustRefundStatus: o.adjust_refund_status ?? undefined,
    adjustRefundAmount: num(o.adjust_refund_amount),
    adjustRefundedAt: o.adjust_refunded_at ?? undefined,
    totalAmount: Number(o.total_amount),
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    progress,
  };
}

export function mapService(s: any): Service {
  return { id: s.id, name: s.name, description: s.description ?? "", price: Number(s.price), unit: s.unit, active: s.active !== false, icon: s.icon ?? undefined };
}

export function mapNotification(n: any): AppNotification {
  return {
    id: n.id,
    userId: n.user_id,
    title: n.title,
    message: n.message,
    type: n.type,
    orderId: n.order_id ?? undefined,
    read: n.read,
    createdAt: n.created_at,
  };
}
