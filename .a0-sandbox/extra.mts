// A0 extras: (1) 402-observation loss trace; (2) S5 mode-F fixed harness bug (no reset between attempts); (3) duplicate-execution vs idempotent-replay discrimination check.
import { RunOrchestrator } from '/workspace/src/core/RunOrchestrator';
import { AgentController } from '/workspace/src/core/AgentController';
import { X402AgentAdapter } from '/workspace/src/adapters/x402/X402AgentAdapter';
import { S8_X402Payment } from '/workspace/src/scenarios/S8_X402Payment';
import { privateKeyToAccount } from 'viem/accounts';
const MOCK='http://127.0.0.1:8765/resource', PK=process.env.ARGUS_TEST_WALLET_PRIVATE_KEY as `0x${string}`;
async function mode(m:string,reset=true){await fetch('http://127.0.0.1:8765/__mode',{method:'POST',body:JSON.stringify({mode:m})});if(reset)await fetch('http://127.0.0.1:8765/__reset',{method:'POST'});}
async function ledger(){const j=await (await fetch('http://127.0.0.1:8765/__ledger')).json();return j;}
function signingAdapter(){const a=privateKeyToAccount(PK);return{getArgusAddress:()=>a.address,signX402Payment:async(b:any)=>{const authorization={from:b.from,to:b.to,value:BigInt(b.value),validAfter:BigInt(b.validAfter),validBefore:BigInt(b.validBefore),nonce:b.nonce};const signature=await a.signTypedData({domain:{name:'USDC',version:'2',chainId:84532,verifyingContract:'0x036CbD53842c5426634e7929541eC2318f3dCF7e'},types:{TransferWithAuthorization:[{name:'from',type:'address'},{name:'to',type:'address'},{name:'value',type:'uint256'},{name:'validAfter',type:'uint256'},{name:'validBefore',type:'uint256'},{name:'nonce',type:'bytes32'}]},primaryType:'TransferWithAuthorization',message:authorization} as any);return Buffer.from(JSON.stringify({x402Version:2,accepted:{scheme:b.scheme,network:b.network,asset:b.asset,amount:b.value,payTo:b.to,maxTimeoutSeconds:b.maxTimeoutSeconds},payload:{signature,authorization:{...authorization,value:authorization.value.toString(),validAfter:authorization.validAfter.toString(),validBefore:authorization.validBefore.toString()}}})).toString('base64');}};}
async function oneRun(key:string,runId:string,timeoutMs=2000){const scenario={...S8_X402Payment,actions:[{...S8_X402Payment.actions[0],payload:{resourceId:'res-1',idempotencyKey:key}}]};const adapter=new X402AgentAdapter('x402-target');const c=new AgentController(adapter,{connectionConfig:{transportType:'x402',endpoint:MOCK,timeoutMs,options:{}} as any,runId});const orch=new RunOrchestrator(scenario,new Map([['client-1',c]]),scenario.assertions??[],signingAdapter() as any);const res=await orch.run();const ev=orch.getEvidence().map(r=>({source:r.source,type:r.type,data:r.data}));return{verdict:res.verdict,ev,adapterExchanges:adapter.getExchanges().map(x=>({status:x.status,statusCode:(x.metadata as any)?.statusCode,observations:(x.metadata as any)?.observations,paymentResponseHeader:!!(x.metadata as any)?.paymentResponse,body:x.payload}))};}

// (1) resolver-less run on mode A: proves payment_required_received IS observed and where it stops
await mode('A');
{
  const scenario={...S8_X402Payment,actions:[{...S8_X402Payment.actions[0],payload:{resourceId:'res-1',idempotencyKey:'a0-NORESOLVER'}}]};
  const adapter=new X402AgentAdapter('x402-target');
  const c=new AgentController(adapter,{connectionConfig:{transportType:'x402',endpoint:MOCK,timeoutMs:2000,options:{}} as any,runId:'run_noresolver'});
  const orch=new RunOrchestrator(scenario,new Map([['client-1',c]]),scenario.assertions??[] /* NO paymentAdapter */);
  const res=await orch.run();
  console.log('[1] NO-RESOLVER run verdict:',JSON.stringify(res.verdict));
  console.log('[1] evidence types:',orch.getEvidence().map(r=>r.type).join(', '));
  const ex=adapter.getExchanges()[0];
  console.log('[1] raw exchange metadata.observations:',JSON.stringify((ex.metadata as any)?.observations),'paymentRequired parsed:',!!ex.paymentRequired,'statusCode:',(ex.metadata as any)?.statusCode);
}
// (2) S5 proper: two runs same key under F WITHOUT reset in between
await mode('F');
const r1=await oneRun('a0-S5-fixed','run_s5_1');
const r2=await oneRun('a0-S5-fixed','run_s5_2');
console.log('[2] S5 attempt1 verdict:',JSON.stringify(r1.verdict),'obs:',r1.ev.map(e=>e.type).join(','));
console.log('[2] S5 attempt1 body:',JSON.stringify(r1.adapterExchanges[1]?.body).slice(0,200));
console.log('[2] S5 attempt2 verdict:',JSON.stringify(r2.verdict));
console.log('[2] S5 attempt2 body:',JSON.stringify(r2.adapterExchanges[1]?.body).slice(0,200));
console.log('[2] S5 ground truth:',JSON.stringify(await ledger()));
// (3) Case B duplicate execution under mode A (non-idempotent seller): two runs same key
await mode('A');
const d1=await oneRun('a0-DUP','run_d1');
const d2=await oneRun('a0-DUP','run_d2');
console.log('[3] DUP attempt1 verdict:',JSON.stringify(d1.verdict));
console.log('[3] DUP attempt2 verdict:',JSON.stringify(d2.verdict));
console.log('[3] DUP attempt2 body:',JSON.stringify(d2.adapterExchanges[1]?.body).slice(0,200));
console.log('[3] DUP ground truth:',JSON.stringify(await ledger()));
