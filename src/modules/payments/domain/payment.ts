export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED"

export interface Payment {
  id: string
  orderId: string
  amount: number
  currency: string
  status: PaymentStatus
  createdAt: Date
}
