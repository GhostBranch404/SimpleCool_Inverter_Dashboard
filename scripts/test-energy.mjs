import {build} from 'esbuild';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
const secret=randomBytes(32).toString('base64');
const result=await build({entryPoints:['lib/deye.ts'],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.PROD':'true'},plugins:[{name:'test-runtime',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'runtime',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`export const env={SESSION_KEY:${JSON.stringify(secret)}}` }));}}]});
const {seal,open,connect,energy}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const session={token:'test-token',region:'eu',user:'owner',expires:Date.now()+60000,stations:[{id:123,name:'Home',timezone:'Africa/Johannesburg'}]};
await test('session encryption binds access to its owner and rejects tampering and expiry',async()=>{const encrypted=await seal(session);assert.equal(encrypted.includes('test-token'),false);assert.deepEqual(await open(encrypted,'owner'),session);assert.equal(await open(encrypted,'other'),null);assert.equal(await open(encrypted.slice(0,10)+'x'+encrypted.slice(11),'owner'),null);assert.equal(await open(await seal({...session,expires:Date.now()-1}),'owner'),null);});
const originalFetch=globalThis.fetch;
await test('Deye login hashes the password and retains only token and plant metadata',async()=>{const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url:String(url),body:JSON.parse(options.body)});return Response.json(calls.length===1?{success:true,accessToken:'new-token',expiresIn:3600}:{success:true,stationList:[{id:123,name:'Home',regionTimezone:'Africa/Johannesburg'}]});};try{const value=await connect({appId:'app',appSecret:'secret',email:'example@example.com',password:'dummy-password',region:'eu'},'owner');assert.equal(calls[0].body.password.length,64);assert.notEqual(calls[0].body.password,'dummy-password');assert.equal('password' in value,false);assert.equal('appSecret' in value,false);assert.equal(value.stations[0].id,123);}finally{globalThis.fetch=originalFetch;}});
await test('readings preserve unavailable values, history failure does not erase current data, and repeated reads are cached',async()=>{let calls=0;globalThis.fetch=async(url)=>{calls++;if(String(url).includes('/station/device'))return Response.json({success:true,deviceListItems:[]});if(String(url).includes('/latest'))return Response.json({success:true,batterySOC:65,consumptionPower:1500,generationPower:null});if(String(url).includes('/history'))throw new Error('Test outage');throw new Error('Unexpected endpoint');};try{const value=await energy(session,123);assert.equal(value.reading.batterySOC,65);assert.equal(value.reading.generationPower,null);assert.equal(value.reading.purchasePower,null);assert.equal(value.historyError,true);assert.equal(value.totalsError,true);assert.deepEqual(await energy(session,123),value);assert.equal(calls,6);await assert.rejects(energy(session,999));}finally{globalThis.fetch=originalFetch;}});

await test('Deye timestamps preserve measurement time and accept numeric history timestamps', async () => {
  const epoch = 1793732400;
  const expected = new Date(epoch * 1000).toISOString();
  globalThis.fetch = async (url, options) => {
    const path = String(url);
    if (path.endsWith('/station/device')) return Response.json({success: true, deviceListItems: []});
    if (path.endsWith('/station/latest')) return Response.json({success: true, lastUpdateTime: epoch, batterySOC: 80});
    const {granularity} = JSON.parse(options.body);
    return Response.json({success: true, stationDataItems: granularity === 1
      ? [{timeStamp: epoch * 1000, generationPower: 1000}, {timeStamp: null, generationPower: 2000}]
      : []});
  };
  try {
    const result = await energy({...session, token: 'timestamp-test'}, 123);
    assert.equal(result.reading.lastUpdateTime, expected);
    assert.equal(result.history.length, 1);
    assert.equal(result.history[0].timeStamp, expected);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test('device metrics use the reported lifetime and AC temperature with relay status', async () => {
  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.endsWith('/station/device')) return Response.json({success:true,deviceListItems:[{deviceType:'INVERTER',deviceSn:'test-inverter'}]});
    if (path.endsWith('/device/latest')) return Response.json({success:true,deviceDataList:[{
      collectionTime: Math.floor(Date.now()/1000),
      dataList:[
        {key:'TotalActiveProduction',value:'241.90'},
        {key:'AC Temperature',value:'48.80'},
        {key:'GridRelayStatus',value:'Pull-in'},
        {key:'GridVoltageL1L2',value:'236.40'},
      ],
    }]});
    if (path.endsWith('/station/latest')) return Response.json({success:true,lastUpdateTime:Date.now(),batterySOC:100});
    return Response.json({success:true,stationDataItems:[]});
  };
  try {
    const result = await energy({...session, token:'metrics-test'},123);
    assert.equal(result.lifetimeGeneration,241.9);
    assert.equal(result.acTemperature,48.8);
    assert.equal(result.gridUnavailable,false);
  } finally { globalThis.fetch=originalFetch; }
});
