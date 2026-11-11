import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createObjectStorage} from '../server/object-storage.ts'
const options={endpoint:'https://objects.example.test',region:'us-east-1',bucket:'item-images',accessKeyId:'fixture-id',secretAccessKey:'fixture-secret'}
const path='11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.webp'
test('private object signing uses path style, bounded lifetime, and never exposes secret key',async()=>{
 const store=createObjectStorage(options)
 const url=new URL(await store.sign(path))
 assert.equal(url.origin,options.endpoint);assert.equal(url.pathname,`/item-images/${path}`)
 assert.equal(url.searchParams.get('X-Amz-Expires'),'600');assert.ok(url.searchParams.has('X-Amz-Signature'))
 assert.ok(!url.href.includes(options.secretAccessKey))
 for(const key of ['../escape.webp','arbitrary.txt','https://other.example/key'])await assert.rejects(()=>store.sign(key))
})
test('object uploads are private WebP with bounded transport and safe failure messages',async()=>{
 const commands:unknown[]=[]
 const store=createObjectStorage(options,async(command,signal)=>{commands.push(command);assert.ok(signal);throw new Error('fixture-secret')})
 await assert.rejects(()=>store.put(path,Buffer.from('webp')),(error:Error)=>!error.message.includes('fixture-secret'))
 const command=commands[0] as {input:Record<string,unknown>}
 assert.equal(command.input.ContentType,'image/webp');assert.equal(command.input.CacheControl,'private, no-store');assert.equal(command.input.ACL,undefined)
})
