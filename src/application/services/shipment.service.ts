import { Order, OrderStatus } from "../../domain/entities/order"
import { transitionOrder } from "../../domain/order-state-machine"
import { Shipment } from "../../domain/entities/shipment"

export class ShipmentService {

  shipOrder(order: Order, trackingNumber: string): { order: Order; shipment: Shipment } {

    if (order.status !== OrderStatus.PAID) {
      throw new Error("Order is not ready for shipping")
    }

    const shipment: Shipment = {
      id: crypto.randomUUID(),
      orderId: order.id,
      trackingNumber,
      status: "SHIPPED",
      shippedAt: new Date()
    }

    const newStatus = transitionOrder(order.status, OrderStatus.SHIPPED)

    const updatedOrder: Order = {
      ...order,
      status: newStatus,
      updatedAt: new Date()
    }

    return { order: updatedOrder, shipment }
  }

  confirmDelivery(order: Order, shipment: Shipment): { order: Order; shipment: Shipment } {

    if (order.status !== OrderStatus.SHIPPED) {
      throw new Error("Order is not shipped yet")
    }

    const updatedShipment: Shipment = {
      ...shipment,
      status: "DELIVERED",
      deliveredAt: new Date()
    }

    const newStatus = transitionOrder(order.status, OrderStatus.DELIVERED)

    const updatedOrder: Order = {
      ...order,
      status: newStatus,
      updatedAt: new Date()
    }

    return { order: updatedOrder, shipment: updatedShipment }
  }
}
