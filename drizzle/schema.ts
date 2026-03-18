import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  json,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extended with seller/buyer specific fields for the Escrow platform.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  
  // User type: seller, buyer, or both
  userType: mysqlEnum("userType", ["buyer", "seller", "both"]).default("buyer").notNull(),
  
  // Profile information
  profileImage: text("profileImage"), // CDN URL
  bio: text("bio"),
  city: varchar("city", { length: 100 }),
  
  // Verification status
  isEmailVerified: boolean("isEmailVerified").default(false),
  isPhoneVerified: boolean("isPhoneVerified").default(false),
  isIdentityVerified: boolean("isIdentityVerified").default(false),
  identityDocumentUrl: text("identityDocumentUrl"), // URL to uploaded identity document
  identityVerifiedAt: timestamp("identityVerifiedAt"),
  phoneNumberVerifiedAt: timestamp("phoneNumberVerifiedAt"),
  
  // Verification fields
  verificationLevel: int("verificationLevel").default(0).notNull(), // 0: Not verified, 1: Phone, 2: ID, 3: Fully verified
  nationalIdNumberEncrypted: text("nationalIdNumberEncrypted"), // AES-256 encrypted
  selfieImageUrl: text("selfieImageUrl"),
  faceMatchScore: decimal("faceMatchScore", { precision: 5, scale: 2 }),
  otpCode: varchar("otpCode", { length: 6 }),
  otpExpiresAt: timestamp("otpExpiresAt"),
  
  // Trusted seller badge
  isTrustedSeller: boolean("isTrustedSeller").default(false),
  trustedSellerExpiresAt: timestamp("trustedSellerExpiresAt"),
  
  // Account status
  isActive: boolean("isActive").default(true),
  isSuspended: boolean("isSuspended").default(false),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Wallet table - tracks user balance and wallet history
 */
export const wallets = mysqlTable("wallets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // Balance in LYD (Libyan Dinar)
  balance: decimal("balance", { precision: 15, scale: 2 }).default("0").notNull(),
  
  // Pending balance (from completed transactions waiting for withdrawal)
  pendingBalance: decimal("pendingBalance", { precision: 15, scale: 2 }).default("0").notNull(),
  
  // Total earned (cumulative)
  totalEarned: decimal("totalEarned", { precision: 15, scale: 2 }).default("0").notNull(),
  
  // Total withdrawn (cumulative)
  totalWithdrawn: decimal("totalWithdrawn", { precision: 15, scale: 2 }).default("0").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Wallet = typeof wallets.$inferSelect;
export type InsertWallet = typeof wallets.$inferInsert;

/**
 * Transactions table - tracks all wallet movements
 */
export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  type: mysqlEnum("type", [
    "deposit", // Money added to wallet
    "withdrawal", // Money withdrawn from wallet
    "commission", // Commission deducted from transaction
    "refund", // Refund for cancelled transaction
    "transfer", // Transfer between users (future)
  ]).notNull(),
  
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  
  // Status of the transaction
  status: mysqlEnum("status", ["pending", "completed", "failed", "cancelled"]).default("pending").notNull(),
  
  // Related entities
  escrowId: int("escrowId"),
  productPurchaseId: int("productPurchaseId"),
  withdrawalRequestId: int("withdrawalRequestId"),
  
  // Metadata
  description: text("description"),
  reference: varchar("reference", { length: 100 }), // Payment gateway reference
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

/**
 * Escrow table - core of the platform
 */
export const escrows = mysqlTable("escrows", {
  id: int("id").autoincrement().primaryKey(),
  
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  
  buyerId: int("buyerId").notNull(),
  sellerId: int("sellerId").notNull(),
  
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  
  // Commission details
  commissionPercentage: decimal("commissionPercentage", { precision: 5, scale: 2 }).default("2.5").notNull(),
  commissionAmount: decimal("commissionAmount", { precision: 15, scale: 2 }).notNull(),
  commissionPaidBy: mysqlEnum("commissionPaidBy", ["buyer", "seller", "split"]).default("buyer").notNull(),
  
  // Deal Type
  dealType: mysqlEnum("dealType", ["physical", "digital_account", "service"]).default("physical").notNull(),
  
  // Dynamic specifications based on deal type (JSON)
  // Physical: { shippingCompany, trackingNumber, inspectionPeriod }
  // Digital: { accountType, followersCount, linkedEmail, verificationPeriod }
  // Service: { description, deliveryPeriod, milestones: [] }
  specifications: json("specifications"),

  // Status
  status: mysqlEnum("status", [
    "draft", // Not yet funded
    "funded", // Buyer paid, money in escrow
    "delivered", // Seller delivered, waiting for buyer approval
    "completed", // Buyer approved, money released to seller
    "disputed", // Something went wrong, admin intervention needed
    "cancelled", // Cancelled and refunded
  ]).default("draft").notNull(),
  
  // Dates
  fundedAt: timestamp("fundedAt"),
  deliveredAt: timestamp("deliveredAt"),
  completedAt: timestamp("completedAt"),
  
  // Dispute info
  disputeRaisedAt: timestamp("disputeRaisedAt"),
  disputeRaisedBy: int("disputeRaisedBy"),
  disputeReason: text("disputeReason"),
  disputeResolution: text("disputeResolution"),
  disputeResolvedAt: timestamp("disputeResolvedAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Escrow = typeof escrows.$inferSelect;
export type InsertEscrow = typeof escrows.$inferInsert;

/**
 * Digital Products table
 */
export const digitalProducts = mysqlTable("digitalProducts", {
  id: int("id").autoincrement().primaryKey(),
  
  sellerId: int("sellerId").notNull(),
  
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }).notNull(),
  
  price: decimal("price", { precision: 15, scale: 2 }).notNull(),
  
  // Product media
  thumbnailUrl: text("thumbnailUrl"),
  previewUrl: text("previewUrl"), // For samples/previews
  
  // Delivery details
  deliveryType: mysqlEnum("deliveryType", [
    "instant", // Delivered immediately after purchase
    "manual", // Seller manually delivers
    "email", // Sent via email
  ]).default("manual").notNull(),
  
  // For instant delivery: store product codes/keys
  productCodes: json("productCodes"), // Array of codes for instant delivery
  
  // Status
  isActive: boolean("isActive").default(true),
  
  // Ratings
  averageRating: decimal("averageRating", { precision: 3, scale: 2 }).default("0"),
  totalReviews: int("totalReviews").default(0),
  
  // New fields for enhanced store
  city: varchar("city", { length: 100 }),
  condition: mysqlEnum("condition", ["new", "used"]).default("new"),
  specifications: json("specifications"), // Detailed specs like { "level": 50, "skins": 100 }
  images: json("images"), // Array of image URLs
  isFeatured: boolean("isFeatured").default(false),
  salesCount: int("salesCount").default(0),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DigitalProduct = typeof digitalProducts.$inferSelect;
export type InsertDigitalProduct = typeof digitalProducts.$inferInsert;

/**
 * Physical Products table
 */
export const physicalProducts = mysqlTable("physicalProducts", {
  id: int("id").autoincrement().primaryKey(),
  sellerId: int("sellerId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }).notNull(), // e.g., "phones", "watches", "accessories"
  price: decimal("price", { precision: 15, scale: 2 }).notNull(),
  thumbnailUrl: text("thumbnailUrl"),
  images: json("images"),
  city: varchar("city", { length: 100 }),
  condition: mysqlEnum("condition", ["new", "used"]).default("new"),
  brand: varchar("brand", { length: 100 }),
  specifications: json("specifications"),
  isActive: boolean("isActive").default(true),
  isFeatured: boolean("isFeatured").default(false),
  averageRating: decimal("averageRating", { precision: 3, scale: 2 }).default("0"),
  totalReviews: int("totalReviews").default(0),
  salesCount: int("salesCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Vehicles table
 */
export const vehicles = mysqlTable("vehicles", {
  id: int("id").autoincrement().primaryKey(),
  sellerId: int("sellerId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }).notNull(), // e.g., "cars", "bikes", "trucks"
  price: decimal("price", { precision: 15, scale: 2 }).notNull(),
  thumbnailUrl: text("thumbnailUrl"),
  images: json("images"),
  city: varchar("city", { length: 100 }),
  year: int("year"),
  mileage: int("mileage"),
  transmission: mysqlEnum("transmission", ["manual", "automatic"]),
  fuelType: mysqlEnum("fuelType", ["petrol", "diesel", "hybrid", "electric"]),
  condition: mysqlEnum("condition", ["new", "used"]).default("used"),
  isActive: boolean("isActive").default(true),
  isFeatured: boolean("isFeatured").default(false),
  averageRating: decimal("averageRating", { precision: 3, scale: 2 }).default("0"),
  totalReviews: int("totalReviews").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Services table
 */
export const services = mysqlTable("services", {
  id: int("id").autoincrement().primaryKey(),
  sellerId: int("sellerId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }).notNull(), // e.g., "hotels", "resorts", "weddings", "trips"
  price: decimal("price", { precision: 15, scale: 2 }).notNull(), // Starting price or fixed price
  thumbnailUrl: text("thumbnailUrl"),
  images: json("images"),
  city: varchar("city", { length: 100 }),
  isActive: boolean("isActive").default(true),
  isFeatured: boolean("isFeatured").default(false),
  averageRating: decimal("averageRating", { precision: 3, scale: 2 }).default("0"),
  totalReviews: int("totalReviews").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Product Purchases table - tracks purchases of digital products
 */
export const productPurchases = mysqlTable("productPurchases", {
  id: int("id").autoincrement().primaryKey(),
  
  productId: int("productId").notNull(),
  buyerId: int("buyerId").notNull(),
  sellerId: int("sellerId").notNull(),
  
  // Purchase details
  quantity: int("quantity").notNull(),
  pricePerUnit: decimal("pricePerUnit", { precision: 15, scale: 2 }).notNull(),
  totalPrice: decimal("totalPrice", { precision: 15, scale: 2 }).notNull(),
  
  // Commission
  commissionPercentage: decimal("commissionPercentage", { precision: 5, scale: 2 }).default("2.5").notNull(),
  commissionAmount: decimal("commissionAmount", { precision: 15, scale: 2 }).notNull(),
  
  // Delivered product codes
  deliveredCodes: json("deliveredCodes"), // Array of delivered codes
  
  // Status
  status: mysqlEnum("status", [
    "pending", // Waiting for payment
    "completed", // Payment received and product delivered
    "cancelled", // Purchase cancelled
  ]).default("pending").notNull(),
  
  completedAt: timestamp("completedAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProductPurchase = typeof productPurchases.$inferSelect;
export type InsertProductPurchase = typeof productPurchases.$inferInsert;

/**
 * Reviews & Ratings table
 */
export const reviews = mysqlTable("reviews", {
  id: int("id").autoincrement().primaryKey(),
  
  // Who is being reviewed
  revieweeId: int("revieweeId").notNull(),
  
  // Who is reviewing
  reviewerId: int("reviewerId").notNull(),
  
  // Related transaction
  escrowId: int("escrowId"), // For escrow-based reviews
  productPurchaseId: int("productPurchaseId"), // For product-based reviews
  
  // Review content
  rating: int("rating").notNull(), // 1-5 stars
  comment: text("comment"),
  
  // Review type
  reviewType: mysqlEnum("reviewType", [
    "seller", // Reviewing seller
    "buyer", // Reviewing buyer
    "product", // Reviewing product
  ]).notNull(),
  
  // Seller response
  sellerResponse: text("sellerResponse"),
  sellerResponseAt: timestamp("sellerResponseAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Review = typeof reviews.$inferSelect;
export type InsertReview = typeof reviews.$inferInsert;

/**
 * Withdrawal Requests table - tracks user withdrawal requests
 */
export const withdrawalRequests = mysqlTable("withdrawalRequests", {
  id: int("id").autoincrement().primaryKey(),
  
  userId: int("userId").notNull(),
  
  // Withdrawal details
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  
  // Payment method for withdrawal
  paymentMethod: mysqlEnum("paymentMethod", [
    "sadad",
    "tadawul",
    "edfaali",
    "bank_transfer",
  ]).notNull(),
  
  // Payment details (encrypted in production)
  paymentDetails: json("paymentDetails"), // Phone number, account number, etc.
  
  // Status
  status: mysqlEnum("status", [
    "pending", // Waiting for admin approval
    "processing", // Being processed
    "completed", // Successfully transferred
    "failed", // Transfer failed
    "cancelled", // User cancelled
  ]).default("pending").notNull(),
  
  // Admin notes
  adminNotes: text("adminNotes"),
  processedBy: int("processedBy"), // Admin user ID
  processedAt: timestamp("processedAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WithdrawalRequest = typeof withdrawalRequests.$inferSelect;
export type InsertWithdrawalRequest = typeof withdrawalRequests.$inferInsert;

/**
 * Deposit requests table - tracks all deposit attempts
 */
export const depositRequests = mysqlTable("depositRequests", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  convertedAmount: decimal("convertedAmount", { precision: 15, scale: 2 }).notNull(), // Amount after commission
  
  paymentMethod: mysqlEnum("paymentMethod", [
    "phone_credit",
    "topup_card",
    "bank_transfer",
    "sadad",
    "tadawul",
    "edfaali",
    "cash",
  ]).notNull(),
  
  paymentDetails: text("paymentDetails"), // JSON string with encrypted details
  
  status: mysqlEnum("status", ["pending", "completed", "failed", "cancelled"]).default("pending").notNull(),
  
  adminNotes: text("adminNotes"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DepositRequest = typeof depositRequests.$inferSelect;
export type InsertDepositRequest = typeof depositRequests.$inferInsert;

/**
 * Trusted Seller Subscriptions table
 */
export const trustedSellerSubscriptions = mysqlTable("trustedSellerSubscriptions", {
  id: int("id").autoincrement().primaryKey(),
  
  userId: int("userId").notNull(),
  
  // Subscription details
  planName: varchar("planName", { length: 100 }).notNull(), // e.g., "monthly", "quarterly", "yearly"
  monthlyPrice: decimal("monthlyPrice", { precision: 15, scale: 2 }).notNull(),
  
  // Subscription period
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  
  // Status
  isActive: boolean("isActive").default(true),
  autoRenew: boolean("autoRenew").default(true),
  
  // Benefits
  benefits: json("benefits"), // Array of benefits
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TrustedSellerSubscription = typeof trustedSellerSubscriptions.$inferSelect;
export type InsertTrustedSellerSubscription = typeof trustedSellerSubscriptions.$inferInsert;

/**
 * Admin Logs table - for audit trail
 */
export const adminLogs = mysqlTable("adminLogs", {
  id: int("id").autoincrement().primaryKey(),
  
  adminId: int("adminId").notNull(),
  
  action: varchar("action", { length: 100 }).notNull(), // e.g., "suspend_user", "resolve_dispute"
  targetType: varchar("targetType", { length: 50 }).notNull(), // e.g., "user", "escrow", "withdrawal"
  targetId: int("targetId").notNull(),
  
  details: json("details"), // Additional action details
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AdminLog = typeof adminLogs.$inferSelect;
export type InsertAdminLog = typeof adminLogs.$inferInsert;

/**
 * Dispute Messages table - stores messages exchanged during a dispute
 */
export const disputeMessages = mysqlTable("disputeMessages", {
  id: int("id").autoincrement().primaryKey(),
  escrowId: int("escrowId").notNull(),
  senderId: int("senderId").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DisputeMessage = typeof disputeMessages.$inferSelect;
export type InsertDisputeMessage = typeof disputeMessages.$inferInsert;

/**
 * Dispute Evidence table - stores links to evidence files uploaded during a dispute
 */
export const disputeEvidence = mysqlTable("disputeEvidence", {
  id: int("id").autoincrement().primaryKey(),
  escrowId: int("escrowId").notNull(),
  uploaderId: int("uploaderId").notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileType: varchar("fileType", { length: 50 }), // e.g., "image", "video", "document"
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DisputeEvidence = typeof disputeEvidence.$inferSelect;
export type InsertDisputeEvidence = typeof disputeEvidence.$inferInsert;

/**
 * Notifications table - stores user notifications
 */
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["transaction", "dispute", "system", "marketing"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  isRead: boolean("isRead").default(false),
  link: text("link"), // Optional link to related page
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * Platform Settings table - stores global platform configuration
 */
export const platformSettings = mysqlTable("platformSettings", {
  id: int("id").autoincrement().primaryKey(),
  
  // General platform settings
  platformName: varchar("platformName", { length: 255 }).default("وثّقلي").notNull(),
  platformDescription: text("platformDescription"),
  contactEmail: varchar("contactEmail", { length: 320 }),
  supportPhone: varchar("supportPhone", { length: 20 }),
  
  // Escrow & Commission settings
  escrowCommissionPercentage: decimal("escrowCommissionPercentage", { precision: 5, scale: 2 }).default("2.5").notNull(),
  productCommissionPercentage: decimal("productCommissionPercentage", { precision: 5, scale: 2 }).default("5.0").notNull(),
  minWithdrawalAmount: decimal("minWithdrawalAmount", { precision: 15, scale: 2 }).default("10.0").notNull(),
  
  // Features toggles
  isRegistrationEnabled: boolean("isRegistrationEnabled").default(true),
  isEscrowEnabled: boolean("isEscrowEnabled").default(true),
  isProductMarketplaceEnabled: boolean("isProductMarketplaceEnabled").default(true),
  
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PlatformSettings = typeof platformSettings.$inferSelect;
export type InsertPlatformSettings = typeof platformSettings.$inferInsert;


/**
 * Chat Conversations table - stores conversations between buyers and sellers
 */
export const chatConversations = mysqlTable("chatConversations", {
  id: int("id").autoincrement().primaryKey(),
  escrowId: int("escrowId").notNull(), // Link to the transaction/escrow
  buyerId: int("buyerId").notNull(),
  sellerId: int("sellerId").notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  isActive: boolean("isActive").default(true),
  lastMessageAt: timestamp("lastMessageAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ChatConversation = typeof chatConversations.$inferSelect;
export type InsertChatConversation = typeof chatConversations.$inferInsert;

/**
 * Chat Messages table - stores individual messages in conversations
 */
export const chatMessages = mysqlTable("chatMessages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  senderId: int("senderId").notNull(),
  messageType: mysqlEnum("messageType", ["text", "image", "audio", "file"]).default("text").notNull(),
  content: text("content"), // Text content or URL for media
  mediaUrl: text("mediaUrl"), // URL for images, audio, files
  mediaType: varchar("mediaType", { length: 50 }), // e.g., "image/jpeg", "audio/mp3"
  mediaDuration: int("mediaDuration"), // Duration in seconds for audio
  isEdited: boolean("isEdited").default(false),
  editedAt: timestamp("editedAt"),
  isDeleted: boolean("isDeleted").default(false),
  deletedAt: timestamp("deletedAt"),
  isEncrypted: boolean("isEncrypted").default(false), // For sensitive messages
  encryptionKey: text("encryptionKey"), // Encrypted key for sensitive messages
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

/**
 * Chat Message Reactions table - stores reactions/emojis on messages
 */
export const chatMessageReactions = mysqlTable("chatMessageReactions", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  userId: int("userId").notNull(),
  reaction: varchar("reaction", { length: 50 }).notNull(), // e.g., "👍", "❤️", "😂"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatMessageReaction = typeof chatMessageReactions.$inferSelect;
export type InsertChatMessageReaction = typeof chatMessageReactions.$inferInsert;

/**
 * Chat Read Receipts table - tracks which messages have been read
 */
export const chatReadReceipts = mysqlTable("chatReadReceipts", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  userId: int("userId").notNull(),
  readAt: timestamp("readAt").defaultNow().notNull(),
});

export type ChatReadReceipt = typeof chatReadReceipts.$inferSelect;
export type InsertChatReadReceipt = typeof chatReadReceipts.$inferInsert;

/**
 * Chat Attachments Metadata table - stores metadata for attachments
 */
export const chatAttachments = mysqlTable("chatAttachments", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileSize: int("fileSize").notNull(), // Size in bytes
  fileUrl: text("fileUrl").notNull(),
  fileType: varchar("fileType", { length: 50 }).notNull(), // e.g., "image", "audio", "document"
  mimeType: varchar("mimeType", { length: 100 }).notNull(),
  uploadedBy: int("uploadedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatAttachment = typeof chatAttachments.$inferSelect;
export type InsertChatAttachment = typeof chatAttachments.$inferInsert;

/**
 * Audit Logs table - tracks all sensitive actions and changes in the system
 */
export const auditLogs = mysqlTable("auditLogs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // User who performed the action
  action: varchar("action", { length: 255 }).notNull(), // e.g., 'user_login', 'escrow_created', 'wallet_updated'
  entityType: varchar("entityType", { length: 255 }), // e.g., 'user', 'escrow', 'wallet'
  entityId: int("entityId"), // ID of the entity affected by the action
  oldValue: json("oldValue"), // Previous state of the entity (optional)
  newValue: json("newValue"), // New state of the entity (optional)
  ipAddress: varchar("ipAddress", { length: 45 }), // IP address of the user
  userAgent: text("userAgent"), // User agent string
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

/**
 * Identity Verifications table - tracks verification attempts and prevents fraud
 */
export const identityVerifications = mysqlTable("identity_verifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // Verification details
  nationalIdNumberHash: varchar("nationalIdNumberHash", { length: 64 }).notNull().unique(), // SHA-256 hash for uniqueness check
  fullName: text("fullName"),
  idCardImageUrl: text("idCardImageUrl"),
  selfieImageUrl: text("selfieImageUrl"),
  
  // Status and results
  status: mysqlEnum("status", ["pending", "approved", "rejected", "flagged"]).default("pending").notNull(),
  faceMatchScore: decimal("faceMatchScore", { precision: 5, scale: 2 }),
  rejectionReason: text("rejectionReason"),
  
  // Anti-fraud
  attemptCount: int("attemptCount").default(1).notNull(),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type IdentityVerification = typeof identityVerifications.$inferSelect;
export type InsertIdentityVerification = typeof identityVerifications.$inferInsert;

/**
 * Export DIaaS schema tables
 */
export * from "./schema_diaas";
export * from "./schema_trust_system";
