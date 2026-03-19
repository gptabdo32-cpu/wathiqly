import { Order, OrderStatus } from "../../domain/entities/order"
import { transitionOrder } from "../../domain/order-state-machine"
import { Payment } from "../../domain/entities/payment"

export class PaymentService {
  processPayment(order: Order): { order: Order; payment: Payment } {
    // 🔒 تحقق من الحالة
    if (order.status !== OrderStatus.AWAITING_PAYMENT) {
      throw new Error("Order is not ready for payment")
    }

    // 💰 إنشاء سجل الدفع
    const payment: Payment = {
      id: crypto.randomUUID(),
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      status: "SUCCESS",
      createdAt: new Date()
    }

    // 🔄 تغيير حالة الطلب باستخدام State Machine
    const newStatus = transitionOrder(order.status, OrderStatus.PAID)

    const updatedOrder: Order = {
      ...order,
      status: newStatus,
      updatedAt: new Date()
    }

    return { order: updatedOrder, payment }
  }
}
