import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const state=vi.hoisted(()=>({mode:'healthy',dns:'healthy',redis:[] as any[],clients:[] as any[],signals:[] as AbortSignal[]}));
vi.mock('../../src/shared/http/probe-host.js',()=>({resolveProbeHost:vi.fn(async(_host:string,signal:AbortSignal)=>{
 state.signals.push(signal);
 if(state.dns==='hang')return new Promise<string>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true}));
 return '127.0.0.1';
})}));
vi.mock('../../src/shared/utils/logger.js',()=>({logger:{info:vi.fn(),warn:vi.fn(),error:vi.fn()}}));
vi.mock('ioredis',()=>({Redis:class{
 options:any;status='ready';disconnects=0;reject?:()=>void;
 constructor(...args:any[]){this.options=typeof args[0]==='object'?args[0]:args[1];state.redis.push(this);}
 on(){return this;}
 connect(){if(state.mode==='hang')return new Promise<void>((_r,reject)=>this.reject=()=>reject(new Error('closed')));if(state.mode==='reject')return Promise.reject(new Error('private redis detail'));return Promise.resolve();}
 ping(){return Promise.resolve('PONG');}
 disconnect(){this.disconnects++;this.reject?.();this.reject=undefined;}
 quit(){return Promise.resolve();}
}}));
vi.mock('pg',()=>({Client:class{
 socket:any;ends=0;
 constructor(options:any){this.socket=options.stream();state.clients.push(this);}
 on(){return this;}
 connect(){if(state.mode==='hang')return new Promise<void>((_r,reject)=>this.socket.once('close',()=>reject(new Error('closed'))));if(state.mode==='reject')return Promise.reject(new Error('private db detail'));return Promise.resolve();}
 query(){return Promise.resolve({rows:[{value:1}]});}
 end(){this.ends++;return Promise.resolve();}
}}));
import {checkDatabaseReadiness} from '../../src/shared/database/readiness.js';
import {getBullMQRedis,isBullMQRedisHealthy,closeBullMQRedis} from '../../src/shared/queue/redis-connection.js';
beforeEach(()=>{state.mode='healthy';state.dns='healthy';state.redis.length=0;state.clients.length=0;state.signals.length=0;vi.stubEnv('DATABASE_URL','postgresql://test@localhost/test');vi.useFakeTimers();});
afterEach(async()=>{await closeBullMQRedis();vi.useRealTimers();vi.unstubAllEnvs();});
describe('RC4 readiness owns bounded disposable resources',()=>{
 it('shares one probe per dependency and closes its resources',async()=>{
  const db=checkDatabaseReadiness(),redis=isBullMQRedisHealthy();
  expect(checkDatabaseReadiness()).toBe(db);expect(isBullMQRedisHealthy()).toBe(redis);
  await db;expect(await redis).toBe(true);
  expect(state.clients).toHaveLength(1);expect(state.clients[0].ends).toBe(1);expect(state.clients[0].socket.destroyed).toBe(true);
  expect(state.redis).toHaveLength(1);expect(state.redis[0].options).toMatchObject({enableOfflineQueue:false,maxRetriesPerRequest:0,disconnectTimeout:0});expect(state.redis[0].disconnects).toBeGreaterThan(0);
  expect(state.signals.every(s=>s.aborted)).toBe(true);expect(vi.getTimerCount()).toBe(0);
 });
 it('closes hanging connections by 1500ms and recovers without disconnecting worker',async()=>{
  const worker=getBullMQRedis();state.mode='hang';
  const db=checkDatabaseReadiness().catch(()=>false),redis=isBullMQRedisHealthy();
  await vi.advanceTimersByTimeAsync(1500);
  expect(await db).toBe(false);expect(await redis).toBe(false);
  expect(state.clients[0].socket.destroyed).toBe(true);expect((worker as any).disconnects).toBe(0);
  state.mode='healthy';await checkDatabaseReadiness();expect(await isBullMQRedisHealthy()).toBe(true);expect(getBullMQRedis()).toBe(worker);expect(vi.getTimerCount()).toBe(0);
 });
 it('cancels pending DNS before creating connections and leaves no timers',async()=>{
  state.dns='hang';const db=checkDatabaseReadiness().catch(()=>false),redis=isBullMQRedisHealthy();
  await vi.advanceTimersByTimeAsync(1500);expect(await db).toBe(false);expect(await redis).toBe(false);expect(state.clients).toHaveLength(0);expect(state.redis).toHaveLength(0);expect(state.signals.every(s=>s.aborted)).toBe(true);expect(vi.getTimerCount()).toBe(0);
 });
 it('redacts rejected dependency errors and permits subsequent retries',async()=>{
  state.mode='reject';await expect(checkDatabaseReadiness()).rejects.toThrow('Database unavailable');expect(await isBullMQRedisHealthy()).toBe(false);
  state.mode='healthy';await checkDatabaseReadiness();expect(await isBullMQRedisHealthy()).toBe(true);expect(vi.getTimerCount()).toBe(0);
 });
});
