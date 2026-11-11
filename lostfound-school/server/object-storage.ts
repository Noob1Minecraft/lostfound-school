import {S3Client,PutObjectCommand,DeleteObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3'
import {getSignedUrl} from '@aws-sdk/s3-request-presigner'
import type {ImageStore} from './neon-database.ts'
import {HttpError} from './errors.ts'
import {assertRequestActive} from './request-context.ts'
type Options={endpoint:string;region:string;bucket:string;accessKeyId:string;secretAccessKey:string}
type Command=PutObjectCommand|DeleteObjectCommand
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const objectPath=new RegExp(`^${uuid}/${uuid}/${uuid}\\.webp$`)
export function createObjectStorage(options:Options,transport?:(command:Command,signal:AbortSignal)=>Promise<unknown>):ImageStore {
 const endpoint=new URL(options.endpoint)
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.pathname!=='/')throw new Error('Invalid object storage endpoint')
 const client=new S3Client({endpoint:options.endpoint,region:options.region,forcePathStyle:true,credentials:{accessKeyId:options.accessKeyId,secretAccessKey:options.secretAccessKey},maxAttempts:2,requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'})
 function key(path:string){if(!objectPath.test(path))throw new HttpError(400,'Некорректный путь изображения');return path}
 async function send(command:Command){
  assertRequestActive()
  try{const signal=AbortSignal.timeout(8000);if(transport)await transport(command,signal);else await client.send(command,{abortSignal:signal});assertRequestActive()}
  catch{throw new HttpError(503,'Хранилище изображений временно недоступно')}
 }
 return {
  async put(path,bytes){await send(new PutObjectCommand({Bucket:options.bucket,Key:key(path),Body:bytes,ContentType:'image/webp',CacheControl:'private, no-store'}))},
  async remove(path){await send(new DeleteObjectCommand({Bucket:options.bucket,Key:key(path)}))},
  async sign(path){assertRequestActive();return getSignedUrl(client,new GetObjectCommand({Bucket:options.bucket,Key:key(path),ResponseCacheControl:'private, no-store'}),{expiresIn:600})},
 }
}
