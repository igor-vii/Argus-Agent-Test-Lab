import { AgentTargetPort, ConnectionResult, ConnectionStatus, Exchange, Evidence, MessageDirection, ExchangeStatus } from '../core/AgentTargetPort';

export interface HttpAdapterConfig {
  baseUrl: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
}

export class HttpAdapter implements AgentTargetPort {
  private id: string;
  private config: HttpAdapterConfig;
  private connected: boolean = false;
  private evidenceLog: Evidence[] = [];

  constructor(id: string, config: HttpAdapterConfig) {
    this.id = id;
    this.config = {
      method: 'POST',
      timeoutMs: 5000,
      ...config
    };
  }

  getId(): string { return this.id; }
  getTargetType(): string { return 'http'; }
  isConnected(): boolean { return this.connected; }

  async connect(): Promise<ConnectionResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);
      
      // Простая проверка здоровья
      const response = await fetch(`${this.config.baseUrl}/health`, {
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        this.connected = true;
        return { status: ConnectionStatus.SUCCESS };
      }
      return { status: ConnectionStatus.FAILURE, error: `HTTP ${response.status}` };
    } catch (e: any) {
      return { 
        status: e.name === 'AbortError' ? ConnectionStatus.TIMEOUT : ConnectionStatus.FAILURE, 
        error: e.message 
      };
    }
  }

  async send(runId: string, type: string, payload?: unknown): Promise<Exchange> {
    if (!this.connected) throw new Error('Not connected');

    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch(this.config.baseUrl, {
        method: this.config.method,
        headers: { 'Content-Type': 'application/json', ...this.config.headers },
        body: JSON.stringify({ type, payload, runId }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      const duration = Date.now() - startTime;
      const status = response.ok ? ExchangeStatus.SUCCESS : ExchangeStatus.FAILURE;
      
      const exchange: Exchange = {
        id: `ex-${Date.now()}`,
        runId,
        direction: MessageDirection.OUTBOUND,
        type,
        payload,
        status,
        timestamp: new Date().toISOString(),
        metadata: { httpStatus: response.status, durationMs: duration }
      };

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      return exchange;
    } catch (e: any) {
      throw new Error(`Send failed: ${e.message}`);
    }
  }

  async receive(runId: string, type: string, payload?: unknown): Promise<Exchange> {
    // В HTTP receive обычно эмулируется через опрос или веб-сокеты
    // Для базовой реализации возвращаем заглушку успеха
    return {
      id: `ex-${Date.now()}-in`,
      runId,
      direction: MessageDirection.INBOUND,
      type,
      payload,
      status: ExchangeStatus.SUCCESS,
      timestamp: new Date().toISOString(),
      metadata: {}
    };
  }

  async captureEvidence(runId: string, type: string, data: unknown, description?: string): Promise<Evidence> {
    const evidence: Evidence = {
      id: `ev-${Date.now()}`,
      runId,
      type,
      data,
      description,
      timestamp: new Date().toISOString(),
      metadata: { source: 'http-adapter' }
    };
    this.evidenceLog.push(evidence);
    return evidence;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }
}
