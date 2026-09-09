import { AgentTargetPort, ConnectionResult, ConnectionStatus, Exchange, Evidence, MessageDirection, ExchangeStatus } from '../core/AgentTargetPort';

export interface McpAdapterConfig {
  endpoint: string;
  transportMode?: 'stdio' | 'http';
  timeoutMs?: number;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: any;
}

export class McpAdapter implements AgentTargetPort {
  private id: string;
  private config: McpAdapterConfig;
  private connected: boolean = false;
  private requestIdCounter: number = 0;

  constructor(id: string, config: McpAdapterConfig) {
    this.id = id;
    this.config = {
      transportMode: 'stdio',
      timeoutMs: 10000,
      ...config
    };
  }

  getId(): string { return this.id; }
  getTargetType(): string { return 'mcp'; }
  isConnected(): boolean { return this.connected; }

  async connect(): Promise<ConnectionResult> {
    // Эмуляция подключения к MCP серверу
    // В реальности здесь был бы запуск процесса или подключение к сокету
    this.connected = true;
    return { status: ConnectionStatus.SUCCESS };
  }

  async send(runId: string, type: string, payload?: unknown): Promise<Exchange> {
    if (!this.connected) throw new Error('MCP Not connected');

    this.requestIdCounter++;
    const rpcRequest: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.requestIdCounter,
      method: type, // Используем тип как имя метода MCP
      params: payload
    };

    // Логирование отправки (в реальном MCP здесь была бы запись в stdin или HTTP POST)
    console.log(`[MCP] Sending to ${this.config.endpoint}:`, JSON.stringify(rpcRequest));

    return {
      id: `mcp-ex-${this.requestIdCounter}`,
      runId,
      direction: MessageDirection.OUTBOUND,
      type,
      payload: rpcRequest,
      status: ExchangeStatus.SUCCESS,
      timestamp: new Date().toISOString(),
      metadata: { protocol: 'json-rpc-2.0', transport: this.config.transportMode }
    };
  }

  async receive(runId: string, type: string, payload?: unknown): Promise<Exchange> {
    // Эмуляция получения ответа от MCP
    return {
      id: `mcp-in-${Date.now()}`,
      runId,
      direction: MessageDirection.INBOUND,
      type,
      payload,
      status: ExchangeStatus.SUCCESS,
      timestamp: new Date().toISOString(),
      metadata: { protocol: 'json-rpc-2.0' }
    };
  }

  async captureEvidence(runId: string, type: string, data: unknown, description?: string): Promise<Evidence> {
    return {
      id: `mcp-ev-${Date.now()}`,
      runId,
      type,
      data,
      description,
      timestamp: new Date().toISOString(),
      metadata: { source: 'mcp-adapter' }
    };
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }
}
