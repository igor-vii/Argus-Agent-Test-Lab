#!/usr/bin/env node

/**
 * Argus Session CLI — Mode A MVP vertical slice.
 *
 * Usage:
 *   npx tsx src/cli/session.ts create --mode BUYER --profile x402-buyer-basic
 *   npx tsx src/cli/session.ts status <sessionId>
 *   npx tsx src/cli/session.ts result <sessionId>
 *   npx tsx src/cli/session.ts serve              (start server + wait)
 *
 * This is a minimal CLI for managing Mode A test sessions.
 * It starts an ephemeral X402SellerAdapter and manages sessions in memory.
 *
 * For production use, this would be integrated into the main argus CLI.
 * For MVP, it runs as a standalone process that stays alive to serve requests.
 */

import { X402SellerAdapter } from '../adapters/seller/X402SellerAdapter';
import { SessionManager } from '../sessions/SessionManager';
import { evaluateSessionVerdict } from '../sessions/TestSession';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log('Usage:');
    console.log('  session create --mode BUYER --profile <name>');
    console.log('  session status <sessionId>');
    console.log('  session result <sessionId>');
    console.log('  session serve');
    process.exit(1);
  }

  // Start seller adapter
  const sellerAdapter = new X402SellerAdapter();
  const baseUrl = await sellerAdapter.start();
  console.error(`[session] Seller adapter started at ${baseUrl}`);

  const manager = new SessionManager(sellerAdapter);
  manager.setBaseUrl(baseUrl);

  try {
    switch (command) {
      case 'create': {
        const modeIdx = args.indexOf('--mode');
        const profileIdx = args.indexOf('--profile');
        const timeoutIdx = args.indexOf('--timeout');

        const mode = modeIdx >= 0 ? args[modeIdx + 1] : 'BUYER';
        const profile = profileIdx >= 0 ? args[profileIdx + 1] : 'x402-buyer-basic';
        const timeout = timeoutIdx >= 0 ? parseInt(args[timeoutIdx + 1], 10) : 60;

        if (mode !== 'BUYER' && mode !== 'SELLER') {
          console.error(`Error: Invalid mode '${mode}'. Must be BUYER or SELLER.`);
          process.exit(1);
        }

        const session = manager.createSession({
          testMode: mode as 'BUYER' | 'SELLER',
          testProfile: profile,
          timeoutSeconds: timeout,
        });

        console.log(JSON.stringify({
          sessionId: session.sessionId,
          testMode: session.testMode,
          testProfile: session.testProfile,
          sessionEndpoint: session.sessionEndpoint,
          expiresAt: new Date(session.expiresAt).toISOString(),
          status: session.status,
        }, null, 2));

        // Keep server alive for incoming requests
        console.error('[session] Server running. Press Ctrl+C to stop.');
        await new Promise(() => {}); // Block forever
        break;
      }

      case 'status': {
        const sessionId = args[1];
        if (!sessionId) {
          console.error('Error: Session ID required');
          process.exit(1);
        }

        const session = manager.getSession(sessionId);
        if (!session) {
          console.error(`Error: Unknown session '${sessionId}'`);
          process.exit(1);
        }

        manager.checkExpiry(sessionId);

        console.log(JSON.stringify({
          sessionId: session.sessionId,
          status: session.status,
          evidenceCount: session.evidence.length,
          createdAt: new Date(session.createdAt).toISOString(),
          expiresAt: new Date(session.expiresAt).toISOString(),
        }, null, 2));
        break;
      }

      case 'result': {
        const sessionId = args[1];
        if (!sessionId) {
          console.error('Error: Session ID required');
          process.exit(1);
        }

        const session = manager.getSession(sessionId);
        if (!session) {
          console.error(`Error: Unknown session '${sessionId}'`);
          process.exit(1);
        }

        manager.checkExpiry(sessionId);
        const result = evaluateSessionVerdict(session);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'serve': {
        // Just start the server and wait
        console.log(JSON.stringify({
          status: 'running',
          baseUrl,
        }, null, 2));
        console.error('[session] Server running. Press Ctrl+C to stop.');
        await new Promise(() => {}); // Block forever
        break;
      }

      default:
        console.error(`Error: Unknown command '${command}'`);
        process.exit(1);
    }
  } catch (error) {
    console.error('Fatal error:', error instanceof Error ? error.message : 'Unknown error');
    await sellerAdapter.stop();
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
