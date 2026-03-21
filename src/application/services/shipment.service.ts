import { Order, OrderStatus } from "../../modules/escrow/domain/order"
import { transitionOrder } from "../../modules/escrow/domain/order-state-machine"
import { Shipment } from "../../modules/escrow/domain/shipment"

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
