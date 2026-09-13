/**
 * MockTargetAdapter - Mock Implementation of AgentTargetAdapter
 * 
 * This is a test/mock implementation that simulates a target agent
 * without requiring actual network connections or external dependencies.
 * 
 * Used for:
 * - Unit testing the AgentTargetAdapter contract
 * - Testing Argus Core without external dependencies
 * - Demonstrating the adapter pattern
 */

import {
  AgentTargetPort,
  TargetConnectionConfig,
  ConnectionResult,
  Exchange,
  Evidence,
  MessageDirection,
  ExchangeStatus,
  RunId,
} from '../core/AgentTargetPort';

/**
 * Generate a unique ID (simplified for mock purposes)
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Configuration specific to the mock target
 */
export interface MockTargetConfig extends TargetConnectionConfig {
  /** Simulate connection delay in ms */
  connectionDelayMs?: number;
  
  /** Simulate failure rate (0.0 - 1.0) */
  failureRate?: number;
  
  /** Pre-programmed responses for specific message types */
  cannedResponses?: Record<string, unknown>;
}

/**
 * Internal state for tracking payment intents by idempotency key
 */
interface PaymentIntent {
  id: string;
  amount: number;
}

/**
 * Mock implementation of AgentTargetPort
 */
export class MockTargetAdapter implements AgentTargetPort {
  private id: string;
  private targetType: string;
  private connected: boolean = false;
  private config?: MockTargetConfig;
  private exchanges: Exchange[] = [];
  private evidences: Evidence[] = [];
  // NOTE: Map operations below are synchronous. Because send() has no
  // await between has() and set(), there is no race window inside a
  // single event loop. This invariant must hold if this adapter is ever
  // wrapped in real async I/O (e.g., HTTP). For S5 concurrency, the
  // target of the test is the SUT, not this mock.
  private paymentIntents: Map<string, PaymentIntent> = new Map();

  constructor(targetType: string = 'mock-target') {
    this.id = generateId('adapter');
    this.targetType = targetType;
  }

  getId(): string {
    return this.id;
  }

  getTargetType(): string {
    return this.targetType;
  }

  async connect(config: TargetConnectionConfig): Promise<ConnectionResult> {
    const mockConfig = config as MockTargetConfig;
    
    // Simulate connection delay
    const delay = (mockConfig.options?.connectionDelayMs as number | undefined) ?? 0;
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    // Simulate potential failure
    const failureRate = (mockConfig.options?.failureRate as number | undefined) ?? 0;
    if (Math.random() < failureRate) {
      return {
        success: false,
        error: 'Simulated connection failure',
      };
    }
    
    this.config = mockConfig;
    this.connected = true;
    
    return {
      success: true,
      connectionId: generateId('conn'),
    };
  }

  isConnected(): boolean {
    return this.connected;
  }

  async send(runId: RunId, type: string, payload?: unknown): Promise<Exchange> {
    if (!this.connected) {
      throw new Error('Not connected. Call connect() first.');
    }

    let responsePayload: unknown = {};
    let observations: string[] = [];

    switch (type) {
      case 'request_payment': {
        const idempotencyKey = (payload as any)?.idempotencyKey;
        const amount = (payload as any)?.amount ?? 100;

        if (idempotencyKey && this.paymentIntents.has(idempotencyKey)) {
          // Target already has a payment_intent for this key - idempotency works
          const existing = this.paymentIntents.get(idempotencyKey)!;
          responsePayload = {
            payment_intent: existing,
            reused: true,
          };
          observations = ['payment_intent_reused', 'response_received'];
        } else {
          // Target creates a new payment_intent
          const newIntent: PaymentIntent = { id: generateId('pi'), amount };
          if (idempotencyKey) {
            this.paymentIntents.set(idempotencyKey, newIntent);
          }
          responsePayload = {
            payment_intent: newIntent,
            reused: false,
          };
          observations = ['payment_intent_created'];
        }
        break;
      }

      default:
        responsePayload = { acknowledged: true };
        observations = [];
    }

    const exchange: Exchange = {
      id: generateId('exch'),
      runId,
      direction: MessageDirection.OUTBOUND,
      type,
      timestamp: Date.now(),
      payload: responsePayload,
      status: ExchangeStatus.SUCCESS,
      metadata: { observations },
    };

    this.exchanges.push(exchange);
    return exchange;
  }

  async receive(runId: RunId, type: string, payload?: unknown): Promise<Exchange> {
    if (!this.connected) {
      throw new Error('Not connected. Call connect() first.');
    }
    
    // Check for canned response
    let responsePayload = payload;
    const cannedResponses = this.config?.options?.cannedResponses as Record<string, unknown> | undefined;
    if (cannedResponses && cannedResponses[type]) {
      responsePayload = cannedResponses[type];
    }
    
    const exchange: Exchange = {
      id: generateId('exch'),
      runId,
      direction: MessageDirection.INBOUND,
      type,
      timestamp: Date.now(),
      payload: responsePayload,
      status: ExchangeStatus.SUCCESS,
    };
    
    this.exchanges.push(exchange);
    return exchange;
  }

  async captureEvidence(
    runId: RunId,
    type: string,
    data: unknown,
    description?: string
  ): Promise<Evidence> {
    const evidence: Evidence = {
      id: generateId('evid'),
      runId,
      type,
      timestamp: Date.now(),
      data,
      description,
    };
    
    this.evidences.push(evidence);
    return evidence;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.config = undefined;
  }

  /**
   * Get all exchanges for this adapter (for testing/inspection)
   */
  getExchanges(): Exchange[] {
    return [...this.exchanges];
  }

  /**
   * Get all evidence for this adapter (for testing/inspection)
   */
  getEvidences(): Evidence[] {
    return [...this.evidences];
  }

  /**
   * Reset the mock state (for testing)
   */
  reset(): void {
    this.connected = false;
    this.config = undefined;
    this.exchanges = [];
    this.evidences = [];
  }
}
