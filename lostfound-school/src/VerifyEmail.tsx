import {useState,type FormEvent} from 'react'
import {Link} from 'react-router-dom'
import {authClient} from './auth'
import {authError} from '../shared/auth-errors'
import {Feedback} from './ui'

export function VerifyEmail({email}:{email:string}) {
 const [code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[verified,setVerified]=useState(false)
 async function submit(event:FormEvent){event.preventDefault();if(busy)return;setBusy(true);setError('');try{await authClient.verifyEmail(email,code);setCode('');setVerified(true)}catch(e){setError(authError(e));setCode('')}finally{setBusy(false)}}
 if(verified)return <p role="status">Email подтверждён. <Link to="/login">Войти с паролем</Link></p>
 return <form onSubmit={submit} aria-label="Подтверждение email" aria-busy={busy}><fieldset disabled={busy}><p>Введи код из последнего письма для {email}. Код действует ограниченное время; если он истёк, запроси новое письмо.</p><label className="field-label" htmlFor="verification-code">Код подтверждения</label><input id="verification-code" className="field" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{4,10}" minLength={4} maxLength={10} required value={code} onChange={e=>setCode(e.target.value)}/><Feedback error={error}/><button className="btn btn-primary" disabled={busy}>{busy?'Проверка…':'Подтвердить email'}</button></fieldset></form>
}
