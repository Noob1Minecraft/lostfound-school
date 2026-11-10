import type { Page } from '@playwright/test'
const owner='11111111-1111-4111-8111-111111111111'
const foundId='22222222-2222-4222-8222-222222222222'
const lostId='33333333-3333-4333-8333-333333333333'
const lost={id:lostId,owner_id:owner,type:'lost',title:'Чёрные наушники',category:'Электроника',color:'Чёрный',location:'Библиотека',date:'2026-11-10',description:'Наушники в чехле',status:'approved',image_path:null,created_at:'2026-11-10'}
const found={...lost,id:foundId,owner_id:foundId,type:'found'}
export async function signedIn(page:Page,admin=false){
 const token=[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:owner,exp:4102444800,role:'authenticated'})).toString('base64url'),'test'].join('.')
 await page.addInitScript(({token,owner})=>localStorage.setItem('sb-school-test-auth-token',JSON.stringify({access_token:token,refresh_token:'test',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:owner,email:'student@school.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}})),{token,owner})
 let rows=[{...lost},{...found}],claims:Record<string,unknown>[]=admin?[{id:'claim',claimant_id:owner,lost_item_id:lostId,found_item_id:foundId,evidence:'Синяя наклейка внутри чехла',status:'pending',admin_note:''}]:[]
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname,method=request.method()
  let data:unknown={}
  if(path==='/api/me')data={id:owner,display_name:'Алия',role:admin?'admin':'student'}
  else if(path==='/api/items'&&method==='POST'){const item={...lost,...request.postDataJSON(),id:'44444444-4444-4444-8444-444444444444',status:'pending'};rows.push(item);data=item}
  else if(path==='/api/items')data=rows
  else if(path.startsWith('/api/items/')&&method==='PATCH'){rows=rows.map(x=>x.id===path.split('/')[3]?{...x,...request.postDataJSON(),status:'pending'}:x);data=rows.find(x=>x.id===path.split('/')[3])}
  else if(path==='/api/matches')data=[{a:lost,b:found,score:100,level:'high',reasons:['Категория: +30','Цвет: +20','Место: +20','Даты в пределах 3 дней: +15','Общие слова в описании: +15']}]
  else if(path==='/api/claims'&&method==='POST'){const claim={...request.postDataJSON(),id:'claim',claimant_id:owner,status:'pending',admin_note:''};claims.push(claim);data=claim}
  else if(path==='/api/claims'||path==='/api/admin/claims')data=claims
  else if(path.startsWith('/api/admin/claims/')&&method==='PATCH'){claims=claims.map(x=>({...x,...request.postDataJSON()}));data=claims[0];if(request.postDataJSON().status==='returned')rows=rows.map(x=>({...x,status:'returned'}))}
  else if(path==='/api/admin/stats')data={lost:1,found:1,pending:0,returned:claims.filter(x=>x.status==='returned').length,claims:claims.filter(x=>x.status==='pending').length}
  await route.fulfill({json:data})
 })
}
