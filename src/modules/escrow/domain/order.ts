export enum OrderStatus {
  CREATED = "CREATED",
  AWAITING_PAYMENT = "AWAITING_PAYMENT",
  PAID = "PAID",
  SHIPPED = "SHIPPED",
  DELIVERED = "DELIVERED",
  INSPECTION = "INSPECTION",
  COMPLETED = "COMPLETED",
  DISPUTED = "DISPUTED",
  REFUNDED = "REFUNDED",
  CANCELLED = "CANCELLED"
}

export interface Order {
  id: string

  buyerId: string
  sellerId: string

  amount: number
  currency: string

  status: OrderStatus

  createdAt: Date
  updatedAt: Date

  inspectionEndsAt?: Date
}
