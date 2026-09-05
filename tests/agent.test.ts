import { Agent } from '../src/agent';
import { AgentConfig } from '../src/agent/types';

describe('Agent Runtime', () => {
  it('should create an agent with config', () => {
    const config: AgentConfig = {
      id: 'agent-1',
      role: 'buyer',
      behaviorProfile: 'honest',
      config: {},
      faults: []
    };
    
    const agent = new Agent(config);
    expect(agent.config.id).toBe('agent-1');
    expect(agent.config.role).toBe('buyer');
  });

  it('should create an agent with faulty behavior', () => {
    const config: AgentConfig = {
      id: 'agent-2',
      role: 'seller',
      behaviorProfile: 'faulty',
      config: {},
      faults: [
        {
          type: 'duplicate_request',
          trigger: { event: 'request.created' },
          params: { count: 2 }
        }
      ]
    };
    
    const agent = new Agent(config);
    expect(agent.config.behaviorProfile).toBe('faulty');
    expect(agent.getFaults().length).toBe(1);
    expect(agent.hasFault('duplicate_request')).toBe(true);
  });

  it('should execute act and observe', async () => {
    const config: AgentConfig = {
      id: 'agent-3',
      role: 'buyer',
      behaviorProfile: 'honest',
      config: {},
      faults: []
    };
    
    const events: any[] = [];
    const agent = new Agent(config, (event) => {
      events.push(event);
    });
    
    await agent.act('createRequest', { requestId: 'req-1' });
    await agent.observe({ state: 'pending' });
    
    expect(events.length).toBe(2);
    expect(events[0].eventType).toBe('action.createRequest');
    expect(events[1].eventType).toBe('observation');
  });
});
