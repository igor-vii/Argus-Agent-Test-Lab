/**
 * AgentTargetPort - Universal Port for Connecting Argus to Any AI-Agent
 * 
 * This is a target-agnostic, transport-agnostic contract that allows Argus
 * to connect to any target agent and exchange observable data.
 * 
 * PRINCIPLES:
 * - ATA does NOT know about any specific target (payment processors, oracles, escrow services, etc.)
 * - ATA does NOT interpret economic semantics
 * - ATA is purely a connectivity/observation port
 * - Semantic interpretation happens above ATA in Argus Core
 */

/**
 * Unique identifier for a test run
 */
export type RunId = string;

/**
 * Unique identifier for an event within a run
 */
export type EventId = string;

/**
 * Timestamp in milliseconds since epoch
 */
export type Timestamp = number;

/**
 * Generic key-value metadata bag for extensibility
 * Target agents can provide additional context-specific data here
 */
export type Metadata = Record<string, unknown>;

/**
 * Direction of communication
 */
export enum MessageDirection {
  /** From Argus/Test Harness to Target Agent */
  OUTBOUND = 'outbound',
  /** From Target Agent to Argus/Test Harness */
  INBOUND = 'inbound',
}

/**
 * Status of an operation/exchange
 */
export enum ExchangeStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILURE = 'failure',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown',
}

/**
 * A single exchange between Argus and a target agent
 * Represents one request/response or observe/act cycle
 */
export interface Exchange {
  /** Unique identifier for this exchange */
  id: string;
  
  /** Reference to the parent run */
  runId: RunId;
  
  /** Direction of this exchange */
  direction: MessageDirection;
  
  /** Type of operation (e.g., 'request', 'response', 'observation', 'action') */
  type: string;
  
  /** When this exchange was initiated */
  timestamp: Timestamp;
  
  /** Optional payload being sent/received */
  payload?: unknown;
  
  /** Status of this exchange */
  status: ExchangeStatus;
  
  /** Optional error information if status is FAILURE */
  error?: string;
  
  /** Target-agent specific metadata (opaque to ATA) */
  metadata?: Metadata;
}

/**
 * Evidence captured during a test run
 * This is raw observational data - interpretation happens in Argus Core
 */
export interface Evidence {
  /** Unique identifier for this evidence record */
  id: string;
  
  /** Reference to the parent run */
  runId: RunId;
  
  /** Reference to related exchange (if applicable) */
  exchangeId?: string;
  
  /** When this evidence was captured */
  timestamp: Timestamp;
  
  /** Type of evidence (e.g., 'state_change', 'event_observed', 'invariant_check') */
  type: string;
  
  /** The actual evidence data (structure depends on type) */
  data: unknown;
  
  /** Optional human-readable description */
  description?: string;
  
  /** Target-agent specific metadata (opaque to ATA) */
  metadata?: Metadata;
}

/**
 * Configuration for connecting to a target agent
 * Transport-specific details are encapsulated here
 */
export interface TargetConnectionConfig {
  /** Type of transport (e.g., 'http', 'mcp', 'local', 'grpc') */
  transportType: string;
  
  /** Connection endpoint (URL, socket path, etc.) */
  endpoint?: string;
  
  /** Transport-specific options */
  options?: Record<string, unknown>;
  
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Result of initializing a connection to a target agent
 */
export interface ConnectionResult {
  /** Whether connection was successful */
  success: boolean;
  
  /** Error message if connection failed */
  error?: string;
  
  /** Connection handle for subsequent operations */
  connectionId?: string;
}

/**
 * The universal AgentTargetPort contract
 * 
 * This interface defines the minimal set of operations needed to:
 * 1. Connect to a target agent
 * 2. Send commands/requests
 * 3. Receive observations/responses
 * 4. Capture evidence
 * 5. Disconnect
 */
export interface AgentTargetPort {
  /**
   * Get the adapter's identifier
   */
  getId(): string;
  
  /**
   * Get the type of target this adapter connects to
   * (e.g., 'payment-processor', 'oracle', 'external-agent')
   * This is for identification/logging only - no semantic assumptions
   */
  getTargetType(): string;
  
  /**
   * Initialize connection to the target agent
   */
  connect(config: TargetConnectionConfig): Promise<ConnectionResult>;
  
  /**
   * Check if connected to the target agent
   */
  isConnected(): boolean;
  
  /**
   * Send a command/request to the target agent
   * Returns the exchange record for observation
   */
  send(runId: RunId, type: string, payload?: unknown): Promise<Exchange>;
  
  /**
   * Receive an observation/response from the target agent
   * Returns the exchange record for observation
   */
  receive(runId: RunId, type: string, payload?: unknown): Promise<Exchange>;
  
  /**
   * Capture evidence from the target interaction
   */
  captureEvidence(runId: RunId, type: string, data: unknown, description?: string): Promise<Evidence>;
  
  /**
   * Close connection to the target agent
   */
  disconnect(): Promise<void>;
}

/**
 * Factory function type for creating adapters
 * Allows dependency injection and testing
 */
export type AdapterFactory = (targetType: string) => AgentTargetPort;
