/**
 * SessionManager — Mode A MVP vertical slice.
 *
 * Manages ephemeral test sessions in memory.
 * No database. No persistence. Sessions expire and are garbage-collected.
 */

import { randomUUID } from 'crypto';
import type { TestSession, TestMode, SessionStatus } from './TestSession';
import { X402SellerAdapter } from '../adapters/seller/X402SellerAdapter';

export interface CreateSessionOptions {
  testMode: TestMode;
  testProfile: string;
  faultProfile?: 'none' | 'timeout' | 'malformed_response' | 'delivery_loss';
  timeoutSeconds?: number;
  paymentConfig?: {
    scheme?: string;
    network?: string;
    amount?: string;
    asset?: string;
    payTo?: string;
    maxTimeoutSeconds?: number;
  };
}

const DEFAULT_TIMEOUT_SECONDS = 60;

const DEFAULT_PAYMENT_CONFIG = {
  scheme: 'exact',
  network: 'eip155:84532',
  amount: '10000',
  asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  payTo: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  maxTimeoutSeconds: 60,
};

export class SessionManager {
  private sessions: Map<string, TestSession> = new Map();
  private sellerAdapter: X402SellerAdapter;
  private baseUrl: string = '';

  constructor(sellerAdapter: X402SellerAdapter) {
    this.sellerAdapter = sellerAdapter;
  }

  /**
   * Set the base URL after the seller adapter has started.
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  /**
   * Create a new test session.
   */
  createSession(options: CreateSessionOptions): TestSession {
    const sessionId = randomUUID();
    const now = Date.now();
    const timeoutMs = (options.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000;

    const session: TestSession = {
      sessionId,
      testMode: options.testMode,
      testProfile: options.testProfile,
      status: 'ACTIVE',
      sessionEndpoint: `${this.baseUrl}/sessions/${sessionId}/resource`,
      createdAt: now,
      expiresAt: now + timeoutMs,
      evidence: [],
      faultProfile: options.faultProfile ?? 'none',
      paymentConfig: {
        ...DEFAULT_PAYMENT_CONFIG,
        ...(options.paymentConfig ?? {}),
      },
    };

    this.sessions.set(sessionId, session);
    this.sellerAdapter.registerSession(session);

    return session;
  }

  /**
   * Get a session by ID.
   */
  getSession(sessionId: string): TestSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all active sessions.
   */
  listSessions(): TestSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Check if a session has expired and update its status.
   */
  checkExpiry(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    if (session.status === 'ACTIVE' && Date.now() > session.expiresAt) {
      session.status = 'EXPIRED';
      return true;
    }
    return false;
  }
}
