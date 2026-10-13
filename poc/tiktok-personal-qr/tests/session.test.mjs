// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import test from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/session.mjs';
import { config, ACCOUNT, resolveAccount } from '../src/config.mjs';
import { createMock } from '../mock/server.mjs';
test('reject live and non-loopback configuration',()=>{
  assert.throws(()=>config({POC_MODE:'live'}));
  for(const POC_URL of ['https://www.tiktok.com','http://localhost:4317','http://127.0.0.1:4317/x'])assert.throws(()=>config({POC_URL}));
  assert.throws(()=>resolveAccount({POC_ACCOUNT:'mock-personal-33'}));
});
test('derives isolated resources for each allowed mock account',()=>{
  const first=config({POC_ACCOUNT:'mock-personal-01',POC_URL:'http://127.0.0.1:4317'});
  const second=config({POC_ACCOUNT:'mock-personal-02',POC_URL:'http://127.0.0.1:4318'});
  assert.notEqual(first.profile,second.profile);
  assert.notEqual(first.ledger,second.ledger);
  assert.notEqual(first.lease,second.lease);
  assert.equal(second.account,'mock-personal-02');
});
test('identity, challenge and expiration fail closed',()=>{
  const s=new Session(ACCOUNT);assert.equal(s.canSend(),false);
  s.observe({authenticated:true,accountId:'wrong'});assert.equal(s.state,'identity_mismatch');assert.equal(s.canSend(),false);
  s.observe({authenticated:true,accountId:ACCOUNT,needsVerification:true});assert.equal(s.state,'needs_verification');assert.equal(s.canSend(),false);
  s.observe({authenticated:true,accountId:ACCOUNT});assert.equal(s.canSend(),true);
  s.observe({authenticated:false});assert.equal(s.state,'session_expired');assert.equal(s.canSend(),false);
  s.observe({authenticated:false});assert.equal(s.state,'session_expired');
});
test('ticket expiry/replay, session challenge and logout',async()=>{
  const m=await createMock({ticketTtlMs:200});
  try{
    const {csrf}=await(await fetch(m.origin+'/api/bootstrap')).json();
    const post=(route,body={},cookie='')=>fetch(m.origin+'/api/'+route,{method:'POST',headers:{Origin:m.origin,'X-Mock-CSRF':csrf,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
    const expired=await(await post('qr')).json();await new Promise(r=>setTimeout(r,220));assert.equal((await post('confirm',{ticket:expired.ticket})).status,410);
    const qr=await(await post('qr')).json();const r=await post('confirm',{ticket:qr.ticket,needsVerification:true});assert.equal(r.status,200);
    const cookie=r.headers.get('set-cookie').split(';')[0];assert.equal((await post('confirm',{ticket:qr.ticket})).status,410);
    const snapshot=async()=> (await fetch(m.origin+'/api/session',{headers:{Cookie:cookie}})).json();
    assert.equal((await snapshot()).needsVerification,true);await post('verify',{},cookie);assert.equal((await snapshot()).accountId,ACCOUNT);assert.equal((await snapshot()).needsVerification,false);
    await post('logout',{},cookie);assert.equal((await snapshot()).authenticated,false);
  }finally{await m.close();}
});
test('cross-origin and missing CSRF writes rejected',async()=>{
  const m=await createMock();try{for(const Origin of [m.origin,'https://example.com'])assert.equal((await fetch(m.origin+'/api/qr',{method:'POST',headers:{Origin}})).status,403);}finally{await m.close();}
});
