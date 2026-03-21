import { Order, OrderStatus } from "../../modules/escrow/domain/order"
import { transitionOrder } from "../../modules/escrow/domain/order-state-machine"
import { Inspection } from "../../modules/escrow/domain/inspection"

export class InspectionService {

  startInspection(order: Order, durationHours: number): { order: Order; inspection: Inspection } {

    if (order.status !== OrderStatus.DELIVERED) {
      throw new Error("Order is not delivered yet")
    }

    const now = new Date()
    const endsAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000)

    const inspection: Inspection = {
      id: crypto.randomUUID(),
      orderId: order.id,
      status: "IN_PROGRESS",
      startedAt: now,
      endsAt
    }

    const newStatus = transitionOrder(order.status, OrderStatus.INSPECTION)

    const updatedOrder: Order = {
      ...order,
      status: newStatus,
      updatedAt: now,
      inspectionEndsAt: endsAt
    }

    return { order: updatedOrder, inspection }
  }

  completeInspection(order: Order, inspection: Inspection, passed: boolean): { order: Order; inspection: Inspection } {

    if (order.status !== OrderStatus.INSPECTION) {
      throw new Error("Inspection not active")
    }

    const updatedInspection: Inspection = {
      ...inspection,
      status: passed ? "PASSED" : "FAILED",
      completedAt: new Date()
    }

    let newStatus: OrderStatus

    if (passed) {
      newStatus = transitionOrder(order.status, OrderStatus.COMPLETED)
    } else {
      newStatus = transitionOrder(order.status, OrderStatus.DISPUTED)
    }

    const updatedOrder: Order = {
      ...order,
      status: newStatus,
      updatedAt: new Date()
    }

    return { order: updatedOrder, inspection: updatedInspection }
  }

  isInspectionExpired(order: Order): boolean {
    if (!order.inspectionEndsAt) return false
    return new Date() > order.inspectionEndsAt
  }

  autoCompleteIfExpired(order: Order): Order {

    if (order.status !== OrderStatus.INSPECTION) return order

    if (this.isInspectionExpired(order)) {
      // Note: Here we directly use transitionOrder to ensure state machine rules
      const newStatus = transitionOrder(order.status, OrderStatus.COMPLETED)
      return {
        ...order,
        status: newStatus,
        updatedAt: new Date()
      }
    }

    return order
  }
}
