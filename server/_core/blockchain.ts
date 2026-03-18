import { ethers } from "ethers";
import { ENV } from "./env.js";

/**
 * Blockchain Integration Module
 * Handles interactions with Smart Contracts on Polygon network
 */

// Contract ABI (Application Binary Interface)
const SMART_ESCROW_ABI = [
  "function createEscrow(address payable _seller, address payable _mediator, string memory _ipfsHash) public payable returns (uint256)",
  "function addMilestone(uint256 _escrowId, uint256 _amount, string memory _description, uint256 _deadline, bool _requiresSignature) public",
  "function completeMilestone(uint256 _escrowId, uint256 _milestoneId) public",
  "function signMilestone(uint256 _escrowId, uint256 _milestoneId, bytes memory _signature) public",
  "function releaseMilestone(uint256 _escrowId, uint256 _milestoneId) public",
  "function disputeMilestone(uint256 _escrowId, uint256 _milestoneId) public",
  "function resolveDispute(uint256 _escrowId, uint256 _milestoneId, bool _releaseToSeller) public",
  "function getEscrow(uint256 _escrowId) public view returns (tuple(uint256 id, address buyer, address seller, address mediator, uint256 totalAmount, uint8 status, uint256 createdAt, uint256 completedAt, string ipfsHash))",
  "function getMilestones(uint256 _escrowId) public view returns (tuple(uint256 id, uint256 amount, uint8 status, string description, uint256 deadline, uint256 completedAt, uint256 releasedAt, bool requiresSignature, uint8 signaturesRequired, uint8 signaturesReceived)[])",
];

interface BlockchainConfig {
  rpcUrl: string;
  contractAddress: string;
  privateKey: string;
  chainId: number;
}

class BlockchainService {
  private provider: ethers.JsonRpcProvider | null = null;
  private signer: ethers.Wallet | null = null;
  private contract: ethers.Contract | null = null;
  private config: BlockchainConfig;

  constructor() {
    this.config = {
      rpcUrl: ENV.polygonRpcUrl || "https://rpc-mumbai.maticvigil.com",
      contractAddress: ENV.smartEscrowContractAddress || "",
      privateKey: ENV.blockchainPrivateKey || "",
      chainId: ENV.chainId || 80001, // Mumbai testnet
    };

    if (this.config.privateKey && this.config.contractAddress) {
      this.initialize();
    }
  }

  private initialize() {
    try {
      this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
      this.signer = new ethers.Wallet(this.config.privateKey, this.provider);
      this.contract = new ethers.Contract(
        this.config.contractAddress,
        SMART_ESCROW_ABI,
        this.signer
      );
      console.log("[Blockchain] Service initialized successfully");
    } catch (error) {
      console.error("[Blockchain] Initialization failed:", error);
    }
  }

  /**
   * Create an escrow on the blockchain
   */
  async createEscrow(
    sellerAddress: string,
    mediatorAddress: string | null,
    ipfsHash: string,
    amountInWei: string
  ): Promise<{ txHash: string; escrowId?: number }> {
    if (!this.contract) throw new Error("Blockchain service not initialized");

    try {
      const tx = await this.contract.createEscrow(
        sellerAddress,
        mediatorAddress || ethers.ZeroAddress,
        ipfsHash,
        { value: amountInWei }
      );

      const receipt = await tx.wait();
      console.log("[Blockchain] Escrow created:", receipt?.hash);

      return { txHash: receipt?.hash || tx.hash };
    } catch (error) {
      console.error("[Blockchain] Create escrow failed:", error);
      throw new Error("Failed to create escrow on blockchain");
    }
  }

  /**
   * Add a milestone to an escrow
   */
  async addMilestone(
    escrowId: number,
    amountInWei: string,
    description: string,
    deadline: number,
    requiresSignature: boolean
  ): Promise<string> {
    if (!this.contract) throw new Error("Blockchain service not initialized");

    try {
      const tx = await this.contract.addMilestone(
        escrowId,
        amountInWei,
        description,
        deadline,
        requiresSignature
      );

      const receipt = await tx.wait();
      console.log("[Blockchain] Milestone added:", receipt?.hash);

      return receipt?.hash || tx.hash;
    } catch (error) {
      console.error("[Blockchain] Add milestone failed:", error);
      throw new Error("Failed to add milestone on blockchain");
    }
  }

  /**
   * Complete a milestone
   */
  async completeMilestone(escrowId: number, milestoneId: number): Promise<string> {
    if (!this.contract) throw new Error("Blockchain service not initialized");

    try {
      const tx = await this.contract.completeMilestone(escrowId, milestoneId);
      const receipt = await tx.wait();
      console.log("[Blockchain] Milestone completed:", receipt?.hash);

      return receipt?.hash || tx.hash;
    } catch (error) {
      console.error("[Blockchain] Complete milestone failed:", error);
      throw new Error("Failed to complete milestone on blockchain");
    }
  }

  /**
   * Sign a milestone
   */
  async signMilestone(
    escrowId: number,
    milestoneId: number,
    signature: string
  ): Promise<string> {
    if (!this.contract) throw new Error("Blockchain service not initialized");

    try {
      const tx = await this.contract.signMilestone(
        escrowId,
        milestoneId,
        signature
      );

      const receipt = await tx.wait();
      console.log("[Blockchain] Milestone signed:", receipt?.hash);

      return receipt?.hash || tx.hash;
    } catch (error) {
      console.error("[Blockchain] Sign milestone failed:", error);
      throw new Error("Failed to sign milestone on blockchain");
    }
  }

  /**
   * Release a milestone
   */
  async releaseMilestone(escrowId: number, milestoneId: number): Promise<string> {
    if (!this.contract) throw new Error("Blockchain service not initialized");

    try {
      const tx = await this.contract.releaseMilestone(escrowId, milestoneId);
      const receipt = await tx.wait();
      console.log("[Blockchain] Milestone released:", receipt?.hash);

      return receipt?.hash || tx.hash;
    } catch (error) {
      console.error("[Blockchain] Release milestone failed:", error);
      throw new Error("Failed to release milestone on blockchain");
    }
  }

  /**
   * Dispute a milestone
   */
  async disputeMilestone(escrowId: number, milestoneId: number): Promise<string> {
    if (!this.contract) throw new Error("Blockchain service not initialized");

    try {
      const tx = await this.contract.disputeMilestone(escrowId, milestoneId);
      const receipt = await tx.wait();
      console.log("[Blockchain] Milestone disputed:", receipt?.hash);

      return receipt?.hash || tx.hash;
    } catch (error) {
      console.error("[Blockchain] Dispute milestone failed:", error);
      throw new Error("Failed to dispute milestone on blockchain");
    }
  }

  /**
   * Get escrow details from blockchain
   */
  async getEscrow(escrowId: number): Promise<any> {
    if (!this.contract) throw new Error("Blockchain service not initialized");

    try {
      const escrow = await this.contract.getEscrow(escrowId);
      return escrow;
    } catch (error) {
      console.error("[Blockchain] Get escrow failed:", error);
      throw new Error("Failed to retrieve escrow from blockchain");
    }
  }

  /**
   * Get milestones from blockchain
   */
  async getMilestones(escrowId: number): Promise<any[]> {
    if (!this.contract) throw new Error("Blockchain service not initialized");

    try {
      const milestones = await this.contract.getMilestones(escrowId);
      return milestones;
    } catch (error) {
      console.error("[Blockchain] Get milestones failed:", error);
      throw new Error("Failed to retrieve milestones from blockchain");
    }
  }

  /**
   * Get transaction receipt
   */
  async getTransactionReceipt(txHash: string): Promise<ethers.TransactionReceipt | null> {
    if (!this.provider) throw new Error("Blockchain service not initialized");

    try {
      return await this.provider.getTransactionReceipt(txHash);
    } catch (error) {
      console.error("[Blockchain] Get transaction receipt failed:", error);
      return null;
    }
  }

  /**
   * Verify a transaction on the blockchain
   */
  async verifyTransaction(txHash: string): Promise<boolean> {
    try {
      const receipt = await this.getTransactionReceipt(txHash);
      return receipt !== null && receipt.status === 1;
    } catch (error) {
      console.error("[Blockchain] Verify transaction failed:", error);
      return false;
    }
  }

  /**
   * Convert amount to Wei
   */
  static toWei(amount: string, decimals: number = 18): string {
    return ethers.parseUnits(amount, decimals).toString();
  }

  /**
   * Convert Wei to amount
   */
  static fromWei(amount: string, decimals: number = 18): string {
    return ethers.formatUnits(amount, decimals);
  }

  /**
   * Sign data with private key
   */
  static signData(data: string, privateKey: string): string {
    const wallet = new ethers.Wallet(privateKey);
    return wallet.signMessage(ethers.getBytes(data));
  }

  /**
   * Verify signed data
   */
  static verifySignature(data: string, signature: string, address: string): boolean {
    try {
      const recoveredAddress = ethers.verifyMessage(ethers.getBytes(data), signature);
      return recoveredAddress.toLowerCase() === address.toLowerCase();
    } catch (error) {
      console.error("[Blockchain] Verify signature failed:", error);
      return false;
    }
  }
}

export const blockchainService = new BlockchainService();
