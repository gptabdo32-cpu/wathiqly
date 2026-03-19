export type InspectionStatus = "PENDING" | "IN_PROGRESS" | "PASSED" | "FAILED"

export interface Inspection {
  id: string
  orderId: string

  status: InspectionStatus

  startedAt: Date
  endsAt: Date
  completedAt?: Date
}
