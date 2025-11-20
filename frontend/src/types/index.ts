// Core Dataset type
export interface Dataset {
  id: string;
  name: string;
  description: string;
  creator: string;
  price: string; // in MIST
  blob_id: string;
  seal_policy_id: string;
  quality_score: number;
  sui_object_id?: string;
  created_at: string;
  updated_at?: string;
}

// Minimal Proof as requested
export interface Proof {
  proof: number[] | string; // bytes or hex/base64 string
  publicInputs: number[] | string;
  isValid?: boolean;
}

// ZK Proof types (extended)
export interface ZKProof {
  proof: number[] | string; // Array of bytes or hex string
  publicInputs: number[] | string;
  isValid?: boolean;
  circuitType: "authenticity" | "quality";
}

export interface ProofGenerationProgress {
  step: "idle" | "generating" | "verifying" | "submitting" | "complete" | "error";
  message: string;
  progress: number; // 0-100
}

// Transaction types
export interface Transaction {
  digest: string;
  status: "pending" | "success" | "failed";
  timestamp: number;
  gasUsed?: string;
}

// Upload types
export interface UploadProgress {
  step: "encrypting" | "uploading" | "generating-proof" | "listing" | "complete";
  message: string;
  progress: number;
}

export interface UploadMetadata {
  name: string;
  description: string;
  price: number; // in SUI
  allowedAddresses?: string[];
}

// Quality types
export interface QualityMetrics {
  score: number;
  isValid: boolean;
  attestation?: string;
  timestamp: number;
  _mock?: boolean; // If using mock data
}

// User and Purchase types
export interface Purchase {
  id: string;
  dataset_id: string;
  buyer_address: string;
  transaction_digest: string;
  amount_paid: string;
  purchased_at: string;
  dataset?: Dataset; // Joined data
}

export interface User {
  address: string;
  balance?: string;
  datasets?: Dataset[];
  purchases?: Purchase[];
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ProofResponse {
  success?: boolean;
  // Backend returns base64-encoded JSON strings of the proof/publicSignals by default
  proof: string | number[];
  publicInputs: string | number[];
  proofHex?: string;
  publicInputsHex?: string;
  rawProof?: any;
  rawPublicSignals?: any;
}

export interface UploadResponse {
  success: boolean;
  blob_id: string;
  seal_policy_id: string;
  upload_size: number;
  original_size: number;
}

// Wallet and Marketplace filters
export type WalletStatus = "connected" | "disconnected" | "connecting";

export interface MarketplaceFilters {
  searchTerm: string;
  minQuality: number;
  maxPrice?: number;
  sortBy: "recent" | "price-low" | "price-high" | "quality";
}


