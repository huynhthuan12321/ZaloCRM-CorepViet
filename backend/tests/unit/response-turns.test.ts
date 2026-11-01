import {describe,it,expect} from 'vitest';
import {pairCustomerResponses,type ResponseEvent} from '../../src/modules/dashboard/response-turns.js';
const date=(time:string)=>new Date(`2026-10-29T${time}:00+07:00`);
const event=(id:string,time:string,senderType='contact',sentVia='user',userId:string|null=null):ResponseEvent=>({id,conversationId:'c',sentAt:date(time),senderType,sentVia,repliedByUserId:userId});
const run=(events:ResponseEvent[],asOf=date('10:00'))=>pairCustomerResponses(events,date('00:00'),new Date('2026-10-30T00:00:00+07:00'),asOf);
describe('Response time from the LAST customer message',()=>{
 it('09:00,09:04 customer then09:05 staff is60 seconds, not300',()=>{const r=run([event('1','09:00'),event('2','09:04'),event('3','09:05','self','user','sale-a')]);expect(r.pairs).toHaveLength(1);expect(r.pairs[0]).toMatchObject({incomingId:'2',seconds:60,userId:'sale-a'});});
 it('AI/bot do not close the human waiting turn',()=>{expect(run([event('1','09:00'),event('2','09:01','self','ai_auto'),event('3','09:03','self','automation'),event('4','09:05','self','user','sale-a')]).pairs[0].seconds).toBe(300);});
 it('only the first staff reply closes a turn',()=>{expect(run([event('1','09:00'),event('2','09:02','self','user','a'),event('3','09:04','self','user','b')]).pairs).toHaveLength(1);});
 it('native replies with unknown actor close a turn without being credited to an owner',()=>{const r=run([event('1','09:00'),event('2','09:02','self','user_native'),event('3','09:04','self','user','a')]);expect(r.pairs).toEqual([]);expect(r.unattributed).toBe(1);expect(r.pending).toBe(0);});
 it('dry-run/deleted/local events do not change the anchor',()=>{const r=run([event('1','09:00'),{...event('2','09:04'),isDeleted:true},{...event('3','09:03'),dryRun:true},{...event('4','09:02'),isLocal:true},event('5','09:05','self','user','a')]);expect(r.pairs[0].seconds).toBe(300);});
 it('asOf prevents a future response from turning pending into completed',()=>{const events=[event('1','09:00'),event('2','09:05','self','user','a')];expect(run(events,date('09:04')).pending).toBe(1);expect(run(events,date('09:04')).pairs).toEqual([]);});
 it('a last inbound outside the selected period is not credited to that period',()=>{const r=pairCustomerResponses([event('1','09:00'),event('2','09:04'),event('3','09:05','self','user','a')],date('08:00'),date('09:03'),date('10:00'));expect(r.pairs).toEqual([]);expect(r.pending).toBe(0);});
});
