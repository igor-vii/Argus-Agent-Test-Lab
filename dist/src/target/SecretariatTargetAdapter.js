"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecretariatTargetAdapter = void 0;
/**
 * Secretariat Target Adapter - MVP Implementation
 *
 * This is a MOCK implementation for autonomous unit/integration tests.
 * It does NOT connect to real production Secretariat API.
 *
 * IMPORTANT: This mock explicitly simulates target behavior for testing.
 * It should not be mistaken for real production integration.
 */
class SecretariatTargetAdapter {
    constructor() {
        this.targetId = 'secretariat';
        this.state = {
            requests: new Map(),
            payments: new Map(),
            executions: new Map()
        };
        this.requestCounter = 0;
        this.paymentCounter = 0;
        this.executionCounter = 0;
    }
    /**
     * Execute an operation on the Secretariat mock
     */
    async execute(action, params) {
        const timestamp = Date.now();
        try {
            switch (params.action) {
                case 'createRequest':
                    return this.handleCreateRequest(params, timestamp);
                case 'submitPayment':
                    return this.handleSubmitPayment(params, timestamp);
                case 'settlePayment':
                    return this.handleSettlePayment(params, timestamp);
                case 'executeRequest':
                    return this.handleExecuteRequest(params, timestamp);
                case 'getExecutionStatus':
                    return this.handleGetExecutionStatus(params, timestamp);
                default:
                    return {
                        success: false,
                        error: `Unknown action: ${params.action}`,
                        timestamp
                    };
            }
        }
        catch (error) {
            return {
                success: false,
                error: String(error),
                timestamp
            };
        }
    }
    /**
     * Observe the current state of the Secretariat mock
     */
    async observe() {
        return {
            status: 'ready',
            pendingRequests: this.state.requests.size,
            lastUpdateTime: Date.now(),
            metadata: {
                totalPayments: this.state.payments.size,
                totalExecutions: this.state.executions.size
            }
        };
    }
    /**
     * Check if target is available
     */
    async isAvailable() {
        // Mock always available
        return true;
    }
    /**
     * Handle createRequest action
     */
    handleCreateRequest(params, timestamp) {
        const requestId = `req-${++this.requestCounter}`;
        this.state.requests.set(requestId, {
            id: requestId,
            status: 'created',
            paymentId: undefined
        });
        return {
            success: true,
            data: {
                requestId,
                status: 'created',
                timestamp
            },
            timestamp
        };
    }
    /**
     * Handle submitPayment action
     */
    handleSubmitPayment(params, timestamp) {
        const paymentId = `pay-${++this.paymentCounter}`;
        this.state.payments.set(paymentId, {
            id: paymentId,
            status: 'submitted',
            amount: params.amount || 0
        });
        // Link payment to request if provided
        if (params.requestId && this.state.requests.has(params.requestId)) {
            const request = this.state.requests.get(params.requestId);
            request.paymentId = paymentId;
            request.status = 'payment_submitted';
        }
        return {
            success: true,
            data: {
                paymentId,
                status: 'submitted',
                timestamp
            },
            timestamp
        };
    }
    /**
     * Handle settlePayment action
     */
    handleSettlePayment(params, timestamp) {
        if (!params.paymentId || !this.state.payments.has(params.paymentId)) {
            return {
                success: false,
                error: 'Payment not found',
                timestamp
            };
        }
        const payment = this.state.payments.get(params.paymentId);
        payment.status = 'settled';
        return {
            success: true,
            data: {
                paymentId: params.paymentId,
                status: 'settled',
                timestamp
            },
            timestamp
        };
    }
    /**
     * Handle executeRequest action
     */
    handleExecuteRequest(params, timestamp) {
        if (!params.requestId || !this.state.requests.has(params.requestId)) {
            return {
                success: false,
                error: 'Request not found',
                timestamp
            };
        }
        const request = this.state.requests.get(params.requestId);
        const executionId = `exec-${++this.executionCounter}`;
        this.state.executions.set(executionId, {
            id: executionId,
            requestId: params.requestId,
            status: 'completed'
        });
        request.status = 'executed';
        return {
            success: true,
            data: {
                executionId,
                requestId: params.requestId,
                status: 'completed',
                timestamp
            },
            timestamp
        };
    }
    /**
     * Handle getExecutionStatus action
     */
    handleGetExecutionStatus(params, timestamp) {
        if (!params.requestId) {
            return {
                success: false,
                error: 'Request ID required',
                timestamp
            };
        }
        const request = this.state.requests.get(params.requestId);
        if (!request) {
            return {
                success: false,
                error: 'Request not found',
                timestamp
            };
        }
        return {
            success: true,
            data: {
                requestId: params.requestId,
                status: request.status,
                paymentId: request.paymentId,
                timestamp
            },
            timestamp
        };
    }
    /**
     * Reset internal state (for testing)
     */
    reset() {
        this.state.requests.clear();
        this.state.payments.clear();
        this.state.executions.clear();
        this.requestCounter = 0;
        this.paymentCounter = 0;
        this.executionCounter = 0;
    }
}
exports.SecretariatTargetAdapter = SecretariatTargetAdapter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VjcmV0YXJpYXRUYXJnZXRBZGFwdGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3RhcmdldC9TZWNyZXRhcmlhdFRhcmdldEFkYXB0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBRUE7Ozs7Ozs7O0dBUUc7QUFDSCxNQUFhLHdCQUF3QjtJQUFyQztRQUNXLGFBQVEsR0FBRyxhQUFhLENBQUM7UUFFMUIsVUFBSyxHQUlUO1lBQ0YsUUFBUSxFQUFFLElBQUksR0FBRyxFQUFFO1lBQ25CLFFBQVEsRUFBRSxJQUFJLEdBQUcsRUFBRTtZQUNuQixVQUFVLEVBQUUsSUFBSSxHQUFHLEVBQUU7U0FDdEIsQ0FBQztRQUVNLG1CQUFjLEdBQUcsQ0FBQyxDQUFDO1FBQ25CLG1CQUFjLEdBQUcsQ0FBQyxDQUFDO1FBQ25CLHFCQUFnQixHQUFHLENBQUMsQ0FBQztJQTZPL0IsQ0FBQztJQTNPQzs7T0FFRztJQUNILEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBYyxFQUFFLE1BQWdDO1FBQzVELE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUU3QixJQUFJLENBQUM7WUFDSCxRQUFRLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDdEIsS0FBSyxlQUFlO29CQUNsQixPQUFPLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7Z0JBRXJELEtBQUssZUFBZTtvQkFDbEIsT0FBTyxJQUFJLENBQUMsbUJBQW1CLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO2dCQUVyRCxLQUFLLGVBQWU7b0JBQ2xCLE9BQU8sSUFBSSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFFckQsS0FBSyxnQkFBZ0I7b0JBQ25CLE9BQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFFdEQsS0FBSyxv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QUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUM1QixJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUM5QixJQUFJLENBQUMsY0FBYyxHQUFHLENBQUMsQ0FBQztRQUN4QixJQUFJLENBQUMsY0FBYyxHQUFHLENBQUMsQ0FBQztRQUN4QixJQUFJLENBQUMsZ0JBQWdCLEdBQUcsQ0FBQyxDQUFDO0lBQzVCLENBQUM7Q0FDRjtBQTVQRCw0REE0UEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBUYXJnZXRBZGFwdGVyLCBTZWNyZXRhcmlhdEV4ZWN1dGVQYXJhbXMsIFNlY3JldGFyaWF0RXhlY3V0ZVJlc3VsdCwgU2VjcmV0YXJpYXRPYnNlcnZlUmVzdWx0IH0gZnJvbSAnLi90eXBlcyc7XG5cbi8qKlxuICogU2VjcmV0YXJpYXQgVGFyZ2V0IEFkYXB0ZXIgLSBNVlAgSW1wbGVtZW50YXRpb25cbiAqIFxuICogVGhpcyBpcyBhIE1PQ0sgaW1wbGVtZW50YXRpb24gZm9yIGF1dG9ub21vdXMgdW5pdC9pbnRlZ3JhdGlvbiB0ZXN0cy5cbiAqIEl0IGRvZXMgTk9UIGNvbm5lY3QgdG8gcmVhbCBwcm9kdWN0aW9uIFNlY3JldGFyaWF0IEFQSS5cbiAqIFxuICogSU1QT1JUQU5UOiBUaGlzIG1vY2sgZXhwbGljaXRseSBzaW11bGF0ZXMgdGFyZ2V0IGJlaGF2aW9yIGZvciB0ZXN0aW5nLlxuICogSXQgc2hvdWxkIG5vdCBiZSBtaXN0YWtlbiBmb3IgcmVhbCBwcm9kdWN0aW9uIGludGVncmF0aW9uLlxuICovXG5leHBvcnQgY2xhc3MgU2VjcmV0YXJpYXRUYXJnZXRBZGFwdGVyIGltcGxlbWVudHMgVGFyZ2V0QWRhcHRlcjxTZWNyZXRhcmlhdEV4ZWN1dGVQYXJhbXMsIFNlY3JldGFyaWF0RXhlY3V0ZVJlc3VsdCwgU2VjcmV0YXJpYXRPYnNlcnZlUmVzdWx0PiB7XG4gIHJlYWRvbmx5IHRhcmdldElkID0gJ3NlY3JldGFyaWF0JztcblxuICBwcml2YXRlIHN0YXRlOiB7XG4gICAgcmVxdWVzdHM6IE1hcDxzdHJpbmcsIHsgaWQ6IHN0cmluZzsgc3RhdHVzOiBzdHJpbmc7IHBheW1lbnRJZD86IHN0cmluZyB9PjtcbiAgICBwYXltZW50czogTWFwPHN0cmluZywgeyBpZDogc3RyaW5nOyBzdGF0dXM6IHN0cmluZzsgYW1vdW50OiBudW1iZXIgfT47XG4gICAgZXhlY3V0aW9uczogTWFwPHN0cmluZywgeyBpZDogc3RyaW5nOyByZXF1ZXN0SWQ6IHN0cmluZzsgc3RhdHVzOiBzdHJpbmcgfT47XG4gIH0gPSB7XG4gICAgcmVxdWVzdHM6IG5ldyBNYXAoKSxcbiAgICBwYXltZW50czogbmV3IE1hcCgpLFxuICAgIGV4ZWN1dGlvbnM6IG5ldyBNYXAoKVxuICB9O1xuXG4gIHByaXZhdGUgcmVxdWVzdENvdW50ZXIgPSAwO1xuICBwcml2YXRlIHBheW1lbnRDb3VudGVyID0gMDtcbiAgcHJpdmF0ZSBleGVjdXRpb25Db3VudGVyID0gMDtcblxuICAvKipcbiAgICogRXhlY3V0ZSBhbiBvcGVyYXRpb24gb24gdGhlIFNlY3JldGFyaWF0IG1vY2tcbiAgICovXG4gIGFzeW5jIGV4ZWN1dGUoYWN0aW9uOiBzdHJpbmcsIHBhcmFtczogU2VjcmV0YXJpYXRFeGVjdXRlUGFyYW1zKTogUHJvbWlzZTxTZWNyZXRhcmlhdEV4ZWN1dGVSZXN1bHQ+IHtcbiAgICBjb25zdCB0aW1lc3RhbXAgPSBEYXRlLm5vdygpO1xuXG4gICAgdHJ5IHtcbiAgICAgIHN3aXRjaCAocGFyYW1zLmFjdGlvbikge1xuICAgICAgICBjYXNlICdjcmVhdGVSZXF1ZXN0JzpcbiAgICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVDcmVhdGVSZXF1ZXN0KHBhcmFtcywgdGltZXN0YW1wKTtcbiAgICAgICAgXG4gICAgICAgIGNhc2UgJ3N1Ym1pdFBheW1lbnQnOlxuICAgICAgICAgIHJldHVybiB0aGlzLmhhbmRsZVN1Ym1pdFBheW1lbnQocGFyYW1zLCB0aW1lc3RhbXApO1xuICAgICAgICBcbiAgICAgICAgY2FzZSAnc2V0dGxlUGF5bWVudCc6XG4gICAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlU2V0dGxlUGF5bWVudChwYXJhbXMsIHRpbWVzdGFtcCk7XG4gICAgICAgIFxuICAgICAgICBjYXNlICdleGVjdXRlUmVxdWVzdCc6XG4gICAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRXhlY3V0ZVJlcXVlc3QocGFyYW1zLCB0aW1lc3RhbXApO1xuICAgICAgICBcbiAgICAgICAgY2FzZSAnZ2V0RXhlY3V0aW9uU3RhdHVzJzpcbiAgICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVHZXRFeGVjdXRpb25TdGF0dXMocGFyYW1zLCB0aW1lc3RhbXApO1xuICAgICAgICBcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICBlcnJvcjogYFVua25vd24gYWN0aW9uOiAke3BhcmFtcy5hY3Rpb259YCxcbiAgICAgICAgICAgIHRpbWVzdGFtcFxuICAgICAgICAgIH07XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICBlcnJvcjogU3RyaW5nKGVycm9yKSxcbiAgICAgICAgdGltZXN0YW1wXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBPYnNlcnZlIHRoZSBjdXJyZW50IHN0YXRlIG9mIHRoZSBTZWNyZXRhcmlhdCBtb2NrXG4gICAqL1xuICBhc3luYyBvYnNlcnZlKCk6IFByb21pc2U8U2VjcmV0YXJpYXRPYnNlcnZlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1czogJ3JlYWR5JyxcbiAgICAgIHBlbmRpbmdSZXF1ZXN0czogdGhpcy5zdGF0ZS5yZXF1ZXN0cy5zaXplLFxuICAgICAgbGFzdFVwZGF0ZVRpbWU6IERhdGUubm93KCksXG4gICAgICBtZXRhZGF0YToge1xuICAgICAgICB0b3RhbFBheW1lbnRzOiB0aGlzLnN0YXRlLnBheW1lbnRzLnNpemUsXG4gICAgICAgIHRvdGFsRXhlY3V0aW9uczogdGhpcy5zdGF0ZS5leGVjdXRpb25zLnNpemVcbiAgICAgIH1cbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrIGlmIHRhcmdldCBpcyBhdmFpbGFibGVcbiAgICovXG4gIGFzeW5jIGlzQXZhaWxhYmxlKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIC8vIE1vY2sgYWx3YXlzIGF2YWlsYWJsZVxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgLyoqXG4gICAqIEhhbmRsZSBjcmVhdGVSZXF1ZXN0IGFjdGlvblxuICAgKi9cbiAgcHJpdmF0ZSBoYW5kbGVDcmVhdGVSZXF1ZXN0KFxuICAgIHBhcmFtczogU2VjcmV0YXJpYXRFeGVjdXRlUGFyYW1zLFxuICAgIHRpbWVzdGFtcDogbnVtYmVyXG4gICk6IFNlY3JldGFyaWF0RXhlY3V0ZVJlc3VsdCB7XG4gICAgY29uc3QgcmVxdWVzdElkID0gYHJlcS0keysrdGhpcy5yZXF1ZXN0Q291bnRlcn1gO1xuICAgIFxuICAgIHRoaXMuc3RhdGUucmVxdWVzdHMuc2V0KHJlcXVlc3RJZCwge1xuICAgICAgaWQ6IHJlcXVlc3RJZCxcbiAgICAgIHN0YXR1czogJ2NyZWF0ZWQnLFxuICAgICAgcGF5bWVudElkOiB1bmRlZmluZWRcbiAgICB9KTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgZGF0YToge1xuICAgICAgICByZXF1ZXN0SWQsXG4gICAgICAgIHN0YXR1czogJ2NyZWF0ZWQnLFxuICAgICAgICB0aW1lc3RhbXBcbiAgICAgIH0sXG4gICAgICB0aW1lc3RhbXBcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEhhbmRsZSBzdWJtaXRQYXltZW50IGFjdGlvblxuICAgKi9cbiAgcHJpdmF0ZSBoYW5kbGVTdWJtaXRQYXltZW50KFxuICAgIHBhcmFtczogU2VjcmV0YXJpYXRFeGVjdXRlUGFyYW1zLFxuICAgIHRpbWVzdGFtcDogbnVtYmVyXG4gICk6IFNlY3JldGFyaWF0RXhlY3V0ZVJlc3VsdCB7XG4gICAgY29uc3QgcGF5bWVudElkID0gYHBheS0keysrdGhpcy5wYXltZW50Q291bnRlcn1gO1xuICAgIFxuICAgIHRoaXMuc3RhdGUucGF5bWVudHMuc2V0KHBheW1lbnRJZCwge1xuICAgICAgaWQ6IHBheW1lbnRJZCxcbiAgICAgIHN0YXR1czogJ3N1Ym1pdHRlZCcsXG4gICAgICBhbW91bnQ6IHBhcmFtcy5hbW91bnQgfHwgMFxuICAgIH0pO1xuXG4gICAgLy8gTGluayBwYXltZW50IHRvIHJlcXVlc3QgaWYgcHJvdmlkZWRcbiAgICBpZiAocGFyYW1zLnJlcXVlc3RJZCAmJiB0aGlzLnN0YXRlLnJlcXVlc3RzLmhhcyhwYXJhbXMucmVxdWVzdElkKSkge1xuICAgICAgY29uc3QgcmVxdWVzdCA9IHRoaXMuc3RhdGUucmVxdWVzdHMuZ2V0KHBhcmFtcy5yZXF1ZXN0SWQpITtcbiAgICAgIHJlcXVlc3QucGF5bWVudElkID0gcGF5bWVudElkO1xuICAgICAgcmVxdWVzdC5zdGF0dXMgPSAncGF5bWVudF9zdWJtaXR0ZWQnO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgZGF0YToge1xuICAgICAgICBwYXltZW50SWQsXG4gICAgICAgIHN0YXR1czogJ3N1Ym1pdHRlZCcsXG4gICAgICAgIHRpbWVzdGFtcFxuICAgICAgfSxcbiAgICAgIHRpbWVzdGFtcFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogSGFuZGxlIHNldHRsZVBheW1lbnQgYWN0aW9uXG4gICAqL1xuICBwcml2YXRlIGhhbmRsZVNldHRsZVBheW1lbnQoXG4gICAgcGFyYW1zOiBTZWNyZXRhcmlhdEV4ZWN1dGVQYXJhbXMsXG4gICAgdGltZXN0YW1wOiBudW1iZXJcbiAgKTogU2VjcmV0YXJpYXRFeGVjdXRlUmVzdWx0IHtcbiAgICBpZiAoIXBhcmFtcy5wYXltZW50SWQgfHwgIXRoaXMuc3RhdGUucGF5bWVudHMuaGFzKHBhcmFtcy5wYXltZW50SWQpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgZXJyb3I6ICdQYXltZW50IG5vdCBmb3VuZCcsXG4gICAgICAgIHRpbWVzdGFtcFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCBwYXltZW50ID0gdGhpcy5zdGF0ZS5wYXltZW50cy5nZXQocGFyYW1zLnBheW1lbnRJZCkhO1xuICAgIHBheW1lbnQuc3RhdHVzID0gJ3NldHRsZWQnO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICBkYXRhOiB7XG4gICAgICAgIHBheW1lbnRJZDogcGFyYW1zLnBheW1lbnRJZCxcbiAgICAgICAgc3RhdHVzOiAnc2V0dGxlZCcsXG4gICAgICAgIHRpbWVzdGFtcFxuICAgICAgfSxcbiAgICAgIHRpbWVzdGFtcFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogSGFuZGxlIGV4ZWN1dGVSZXF1ZXN0IGFjdGlvblxuICAgKi9cbiAgcHJpdmF0ZSBoYW5kbGVFeGVjdXRlUmVxdWVzdChcbiAgICBwYXJhbXM6IFNlY3JldGFyaWF0RXhlY3V0ZVBhcmFtcyxcbiAgICB0aW1lc3RhbXA6IG51bWJlclxuICApOiBTZWNyZXRhcmlhdEV4ZWN1dGVSZXN1bHQge1xuICAgIGlmICghcGFyYW1zLnJlcXVlc3RJZCB8fCAhdGhpcy5zdGF0ZS5yZXF1ZXN0cy5oYXMocGFyYW1zLnJlcXVlc3RJZCkpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICBlcnJvcjogJ1JlcXVlc3Qgbm90IGZvdW5kJyxcbiAgICAgICAgdGltZXN0YW1wXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IHJlcXVlc3QgPSB0aGlzLnN0YXRlLnJlcXVlc3RzLmdldChwYXJhbXMucmVxdWVzdElkKSE7XG4gICAgY29uc3QgZXhlY3V0aW9uSWQgPSBgZXhlYy0keysrdGhpcy5leGVjdXRpb25Db3VudGVyfWA7XG4gICAgXG4gICAgdGhpcy5zdGF0ZS5leGVjdXRpb25zLnNldChleGVjdXRpb25JZCwge1xuICAgICAgaWQ6IGV4ZWN1dGlvbklkLFxuICAgICAgcmVxdWVzdElkOiBwYXJhbXMucmVxdWVzdElkLFxuICAgICAgc3RhdHVzOiAnY29tcGxldGVkJ1xuICAgIH0pO1xuXG4gICAgcmVxdWVzdC5zdGF0dXMgPSAnZXhlY3V0ZWQnO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICBkYXRhOiB7XG4gICAgICAgIGV4ZWN1dGlvbklkLFxuICAgICAgICByZXF1ZXN0SWQ6IHBhcmFtcy5yZXF1ZXN0SWQsXG4gICAgICAgIHN0YXR1czogJ2NvbXBsZXRlZCcsXG4gICAgICAgIHRpbWVzdGFtcFxuICAgICAgfSxcbiAgICAgIHRpbWVzdGFtcFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogSGFuZGxlIGdldEV4ZWN1dGlvblN0YXR1cyBhY3Rpb25cbiAgICovXG4gIHByaXZhdGUgaGFuZGxlR2V0RXhlY3V0aW9uU3RhdHVzKFxuICAgIHBhcmFtczogU2VjcmV0YXJpYXRFeGVjdXRlUGFyYW1zLFxuICAgIHRpbWVzdGFtcDogbnVtYmVyXG4gICk6IFNlY3JldGFyaWF0RXhlY3V0ZVJlc3VsdCB7XG4gICAgaWYgKCFwYXJhbXMucmVxdWVzdElkKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgZXJyb3I6ICdSZXF1ZXN0IElEIHJlcXVpcmVkJyxcbiAgICAgICAgdGltZXN0YW1wXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IHJlcXVlc3QgPSB0aGlzLnN0YXRlLnJlcXVlc3RzLmdldChwYXJhbXMucmVxdWVzdElkKTtcbiAgICBpZiAoIXJlcXVlc3QpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICBlcnJvcjogJ1JlcXVlc3Qgbm90IGZvdW5kJyxcbiAgICAgICAgdGltZXN0YW1wXG4gICAgICB9O1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgZGF0YToge1xuICAgICAgICByZXF1ZXN0SWQ6IHBhcmFtcy5yZXF1ZXN0SWQsXG4gICAgICAgIHN0YXR1czogcmVxdWVzdC5zdGF0dXMsXG4gICAgICAgIHBheW1lbnRJZDogcmVxdWVzdC5wYXltZW50SWQsXG4gICAgICAgIHRpbWVzdGFtcFxuICAgICAgfSxcbiAgICAgIHRpbWVzdGFtcFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogUmVzZXQgaW50ZXJuYWwgc3RhdGUgKGZvciB0ZXN0aW5nKVxuICAgKi9cbiAgcmVzZXQoKTogdm9pZCB7XG4gICAgdGhpcy5zdGF0ZS5yZXF1ZXN0cy5jbGVhcigpO1xuICAgIHRoaXMuc3RhdGUucGF5bWVudHMuY2xlYXIoKTtcbiAgICB0aGlzLnN0YXRlLmV4ZWN1dGlvbnMuY2xlYXIoKTtcbiAgICB0aGlzLnJlcXVlc3RDb3VudGVyID0gMDtcbiAgICB0aGlzLnBheW1lbnRDb3VudGVyID0gMDtcbiAgICB0aGlzLmV4ZWN1dGlvbkNvdW50ZXIgPSAwO1xuICB9XG59XG4iXX0=