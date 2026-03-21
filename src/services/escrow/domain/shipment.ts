export type ShipmentStatus = "PENDING" | "SHIPPED" | "DELIVERED"

export interface Shipment {
  id: string
  orderId: string

  trackingNumber?: string

  status: ShipmentStatus

  shippedAt?: Date
  deliveredAt?: Date
}
