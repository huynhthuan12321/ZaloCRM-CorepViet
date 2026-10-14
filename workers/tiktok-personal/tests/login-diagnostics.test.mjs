import test from 'node:test';
import assert from 'node:assert/strict';
import { safeLoginHttpDiagnostic, isFailedQrCheck, attachLoginDiagnostics } from '../src/login-diagnostics.mjs';
import { EventEmitter } from 'node:events';

test('diagnostics omit URL query, session tokens, arbitrary messages and headers', () => {
  const value = safeLoginHttpDiagnostic('https://www.tiktok.com/passport/web/check_qrcode/?token=private', 200,
    { status_code: 0, message: 'secret email', token: 'private', code: 123456,
      data: { error_code: 7, ticket: 'private', status: 'confirmed', code: 987654 } });
  assert.deepEqual(value, { path: '/passport/web/check_qrcode/', httpStatus: 200,
    codes: { status_code: 0, 'data.error_code': 7, 'data.status': 'confirmed' } });
  assert.equal(JSON.stringify(value).includes('private'), false);
  assert.equal(JSON.stringify(value).includes('secret'), false);
});
test('diagnostics reject unrelated hosts and paths containing private identifiers', () => {
  assert.equal(safeLoginHttpDiagnostic('https://example.com/passport/web/login/', 200, {}), null);
  assert.equal(safeLoginHttpDiagnostic('https://www.tiktok.com/api/messages/12345', 200, {}), null);
});

test('includes observed regional login hosts but rejects lookalike hosts', () => {
  for (const host of ['web-sg.tiktok.com', 'login-us.www.tiktok.com', 'login-eu.www.tiktok.com']) {
    assert.ok(safeLoginHttpDiagnostic(`https://${host}/passport/web/check_qrconnect/?token=private`, 200, {}));
  }
  assert.equal(safeLoginHttpDiagnostic('https://www.tiktok.com.evil.test/passport/web/check_qrconnect/', 200, {}), null);
});

test('requires explicit failure evidence and never infers login or rate limiting from code 7', () => {
  const diagnostic = safeLoginHttpDiagnostic('https://web-sg.tiktok.com/passport/web/check_qrconnect/', 200, {data:{error_code:7}});
  assert.equal(isFailedQrCheck(diagnostic, {data:{error_code:7}}), false);
  assert.equal(isFailedQrCheck(diagnostic, {data:{error_code:7,description:'System error'}}), true);
  assert.equal(isFailedQrCheck(diagnostic, {data:{error_code:7,status:'pending',description:'System error'}}), false);
  assert.equal(isFailedQrCheck({...diagnostic,path:'/passport/web/get_qrcode/'}, {data:{description:'System error'}}), false);
});

test('reports repeated failed QR checks and discards old requests after a new QR', async () => {
  const page = new EventEmitter();
  const state = attachLoginDiagnostics(page);
  const check = () => ({url:()=> 'https://web-sg.tiktok.com/passport/web/check_qrconnect/?token=private'});
  const response = (request,payload) => ({url:request.url,status:()=>200,request:()=>request,json:async()=>payload});
  const oldRequest = check(); page.emit('request',oldRequest);
  for (let i=0;i<3;i++) {
    const request=check(); page.emit('request',request);
    page.emit('response',response(request,{data:{error_code:7,description:'System error'}}));
    await new Promise(resolve=>setImmediate(resolve));
  }
  assert.equal(state.qrCheckFailed(),true);
  assert.equal(state.qrCheckFailed(Date.now()+31000),false);
  const healthy=check();page.emit('request',healthy);
  page.emit('response',response(healthy,{data:{status:'new',error_code:0}}));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(state.qrCheckFailed(),false);
  page.emit('request',{url:()=> 'https://www.tiktok.com/passport/web/get_qrcode/'});
  assert.equal(state.qrCheckFailed(),false);
  page.emit('response',response(oldRequest,{data:{error_code:7,description:'System error'}}));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(state.qrCheckFailed(),false);
});
