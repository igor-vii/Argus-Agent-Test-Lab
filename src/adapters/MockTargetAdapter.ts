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
  AgentTargetAdapter,
  TargetConnectionConfig,
  ConnectionResult,
  Exchange,
  Evidence,
  MessageDirection,
  ExchangeStatus,
  RunId,
} from '../core/AgentTargetAdapter';

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
 * Mock implementation of AgentTargetAdapter
 */
export class MockTargetAdapter implements AgentTargetAdapter {
  private id: string;
  private targetType: string;
  private connected: boolean = false;
  private config?: MockTargetConfig;
  private exchanges: Exchange[] = [];
  private evidences: Evidence[] = [];

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
    
    const exchange: Exchange = {
      id: generateId('exch'),
      runId,
      direction: MessageDirection.OUTBOUND,
      type,
      timestamp: Date.now(),
      payload,
      status: ExchangeStatus.SUCCESS,
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
