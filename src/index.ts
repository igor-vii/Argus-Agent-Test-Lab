/**
 * Argus Agent Test Lab — public API surface.
 */

// Core
export { AgentController } from './core/AgentController';
export { ScenarioEngine } from './core/ScenarioEngine';
export { RunOrchestrator } from './core/RunOrchestrator';
export { EvidenceCollector } from './core/EvidenceCollector';
export type { EvidenceRecord } from './core/EvidenceCollector';

// Adapters
export { MockTargetAdapter } from './adapters/MockTargetAdapter';
export { HttpAgentAdapter } from './adapters/http/HttpAgentAdapter';
export { X402AgentAdapter } from './adapters/x402/X402AgentAdapter';

// Payment
export { BaseSepoliaPaymentAdapter } from './adapters/payment/evm/BaseSepoliaPaymentAdapter';
export type { PaymentAdapter } from './adapters/payment/PaymentAdapter';
export type { SigningBinding } from './adapters/payment/SigningBinding';

// CLI
export { TargetAdapterRegistry } from './cli/TargetAdapterRegistry';
export { ScenarioRegistry } from './cli/ScenarioRegistry';

// Mode A MVP vertical slice
export { X402SellerAdapter } from './adapters/seller/X402SellerAdapter';
export { SessionManager } from './sessions/SessionManager';
export type { TestSession, SessionResult, SessionEvidence, VerdictStatus } from './sessions/TestSession';
export { evaluateSessionVerdict, createSessionEvidence } from './sessions/TestSession';
