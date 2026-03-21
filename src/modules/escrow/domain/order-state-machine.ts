import { OrderStatus } from "./entities/order"

const transitions: Record<OrderStatus, OrderStatus[]> = {
  CREATED: ["AWAITING_PAYMENT", "CANCELLED"],
  AWAITING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["INSPECTION", "DISPUTED"],
  INSPECTION: ["COMPLETED", "DISPUTED"],
  COMPLETED: [],
  DISPUTED: ["REFUNDED", "COMPLETED"],
  REFUNDED: [],
  CANCELLED: []
}

export function canTransition(
  current: OrderStatus,
  next: OrderStatus
): boolean {
  return transitions[current].includes(next)
}

export function transitionOrder(
  current: OrderStatus,
  next: OrderStatus
): OrderStatus {
  if (!canTransition(current, next)) {
    throw new Error(`Invalid transition from ${current} to ${next}`)
  }

  return next
}
