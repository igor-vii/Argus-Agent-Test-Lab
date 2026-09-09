import { describe, it, expect, beforeEach } from 'vitest';
import { HttpAdapter } from '../adapters/HttpAdapter';
import { McpAdapter } from '../adapters/McpAdapter';
import { ConnectionStatus, ExchangeStatus } from '../core/AgentTargetPort';

describe('Protocol Adapters', () => {
  describe('HttpAdapter', () => {
    let adapter: HttpAdapter;

    beforeEach(() => {
      adapter = new HttpAdapter('test-http', { baseUrl: 'http://localhost:8080' });
    });

    it('should implement AgentTargetPort interface', () => {
      expect(adapter.getId()).toBe('test-http');
      expect(adapter.getTargetType()).toBe('http');
      expect(typeof adapter.connect).toBe('function');
      expect(typeof adapter.send).toBe('function');
      expect(typeof adapter.receive).toBe('function');
      expect(typeof adapter.disconnect).toBe('function');
    });

    it('should handle connection failure gracefully', async () => {
      // Так как сервера нет, должно вернуть ошибку или таймаут
      const result = await adapter.connect();
      expect([ConnectionStatus.FAILURE, ConnectionStatus.TIMEOUT]).toContain(result.status);
    });
  });

  describe('McpAdapter', () => {
    let adapter: McpAdapter;

    beforeEach(() => {
      adapter = new McpAdapter('test-mcp', { endpoint: 'mcp-server', transportMode: 'stdio' });
    });

    it('should implement AgentTargetPort interface', () => {
      expect(adapter.getId()).toBe('test-mcp');
      expect(adapter.getTargetType()).toBe('mcp');
    });

    it('should connect successfully (mocked)', async () => {
      const result = await adapter.connect();
      expect(result.status).toBe(ConnectionStatus.SUCCESS);
      expect(adapter.isConnected()).toBe(true);
    });

    it('should send valid JSON-RPC structure', async () => {
      await adapter.connect();
      const exchange = await adapter.send('run-1', 'tools/call', { arg: 'value' });
      
      expect(exchange.status).toBe(ExchangeStatus.SUCCESS);
      expect(exchange.direction).toBe('OUTBOUND');
      // Проверка структуры payload
      const payload = exchange.payload as any;
      expect(payload.jsonrpc).toBe('2.0');
      expect(payload.method).toBe('tools/call');
    });
  });
});
