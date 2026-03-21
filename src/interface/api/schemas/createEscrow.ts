import { z } from "zod";

export const createEscrowSchema = z.object({
  sellerId: z.number().int().positive(), // This will be validated, but its source might need to be re-evaluated later
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/, "Invalid amount format"),
  description: z.string().min(5).max(255),
  sellerWalletAddress: z.string().optional(),
});

export type CreateEscrowRequest = z.infer<typeof createEscrowSchema>;
