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
  
  // Reference to related transaction (e.g., escrow_id, withdrawal_id)
  referenceType: varchar("referenceType", { length: 50 }),
  referenceId: int("referenceId"),
  
  description: text("description"),
  status: mysqlEnum("status", ["pending", "completed", "failed", "cancelled"]).default("pending").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

/**
 * Escrow table - tracks all transactions between buyers and sellers
 */
export const escrows = mysqlTable("escrows", {
  id: int("id").autoincrement().primaryKey(),
  
  // Parties involved
  buyerId: int("buyerId").notNull(),
  sellerId: int("sellerId").notNull(),
  
  // Transaction details
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  
  // Commission calculation
  commissionPercentage: decimal("commissionPercentage", { precision: 5, scale: 2 }).default("2.5").notNull(),
  commissionAmount: decimal("commissionAmount", { precision: 15, scale: 2 }).notNull(),
  
  // Payment method (Libyan methods)
  paymentMethod: mysqlEnum("paymentMethod", [
    "sadad", // سداد
    "tadawul", // تداول
    "edfaali", // إدفع لي
    "bank_transfer", // تحويل بنكي
  ]).notNull(),
  
  // Status tracking
  status: mysqlEnum("status", [
    "pending", // Waiting for buyer to deposit
    "funded", // Money deposited, waiting for delivery
    "delivered", // Seller delivered, waiting for buyer confirmation
    "completed", // Buyer confirmed, transaction complete
    "cancelled", // Transaction cancelled
    "disputed", // Dispute raised
  ]).default("pending").notNull(),
  
  // Delivery tracking
  deliveryProof: text("deliveryProof"), // CDN URL or JSON with proof details
  deliveredAt: timestamp("deliveredAt"),
  
  // Confirmation tracking
  buyerConfirmedAt: timestamp("buyerConfirmedAt"),
  completedAt: timestamp("completedAt"),
  
  // Dispute handling
  disputeReason: text("disputeReason"),
  disputeRaisedBy: int("disputeRaisedBy"), // userId
  disputeRaisedAt: timestamp("disputeRaisedAt"),
  disputeResolution: text("disputeResolution"),
  disputeResolvedAt: timestamp("disputeResolvedAt"),
  
  // Metadata
  metadata: json("metadata"), // Additional custom data
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Escrow = typeof escrows.$inferSelect;
export type InsertEscrow = typeof escrows.$inferInsert;

/**
 * Digital Products table - for the digital marketplace
 */
export const digitalProducts = mysqlTable("digitalProducts", {
  id: int("id").autoincrement().primaryKey(),
  
  // Seller information
  sellerId: int("sellerId").notNull(),
  
  // Product details
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }).notNull(), // e.g., "game_codes", "design_services", "programming", "recharge_cards"
  
  // Pricing
  price: decimal("price", { precision: 15, scale: 2 }).notNull(),
  
  // Product image
  image: text("image"), // CDN URL
  
  // Inventory
  quantity: int("quantity").notNull(), // -1 for unlimited
  
  // Product delivery method
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
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DigitalProduct = typeof digitalProducts.$inferSelect;
export type InsertDigitalProduct = typeof digitalProducts.$inferInsert;

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
