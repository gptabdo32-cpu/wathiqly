export interface IBlockchainOrchestrator {
  processOutboxEvent(event: any): Promise<{ success: boolean; txHash?: string; error?: string }>;
}
