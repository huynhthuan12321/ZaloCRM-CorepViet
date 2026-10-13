// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,rm } from 'node:fs/promises';
import path from 'node:path';
import { createMock } from '../mock/server.mjs';
import { launchMockBrowser } from '../src/browser-adapter.mjs';
import { Session } from '../src/session.mjs';
import { ACCOUNT,root } from '../src/config.mjs';
test('browser QR simulation, profile restore, logout, identity and challenge',async()=>{
  await mkdir(path.join(root,'runtime'),{recursive:true});const profile=await mkdtemp(path.join(root,'runtime','test-profile-'));const m=await createMock();let b;
  const wait=async(expr)=>b.page.waitForFunction(expr);
  const login=async()=>{await b.page.click('#newqr');await wait(()=>document.getElementById('qr').textContent.length>0);await b.page.click('#confirm');await wait(()=>document.body.dataset.authenticated==='true');};
  const logout=async()=>{await b.page.click('#logout');await wait(()=>document.body.dataset.authenticated==='false');};
  try{
    b=await launchMockBrowser({origin:m.origin,profile});await wait(()=>document.body.dataset.authenticated==='false');const s=new Session(ACCOUNT);s.observe(await b.snapshot());assert.equal(s.state,'awaiting_qr');
    await login();s.observe(await b.snapshot());assert.equal(s.canSend(),true);await b.close();
    b=await launchMockBrowser({origin:m.origin,profile});await wait(()=>document.body.dataset.authenticated==='true');s.observe(await b.snapshot());assert.equal(s.canSend(),true);
    await logout();s.observe(await b.snapshot());assert.equal(s.state,'session_expired');
    await b.page.check('#wrong');await login();s.observe(await b.snapshot());assert.equal(s.state,'identity_mismatch');assert.equal(s.canSend(),false);
    await logout();await b.page.uncheck('#wrong');await b.page.check('#verification');await login();s.observe(await b.snapshot());assert.equal(s.state,'needs_verification');assert.equal(s.canSend(),false);
    await b.page.click('#verify');await wait(()=>document.body.dataset.verification==='false');s.observe(await b.snapshot());assert.equal(s.canSend(),true);
    const result=await b.page.evaluate(async()=>{try{return(await fetch('https://example.com')).status;}catch{return'blocked';}});assert.equal(result,'blocked');
  }finally{if(b)await b.close();await m.close();const resolved=path.resolve(profile),base=path.resolve(root,'runtime')+path.sep;if(!resolved.startsWith(base))throw Error('PROFILE_CLEANUP_OUTSIDE_RUNTIME');await rm(resolved,{recursive:true,force:true});}
});
