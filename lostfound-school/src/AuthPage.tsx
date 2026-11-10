import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { supabase, useAuth } from './auth'
import { authError } from '../shared/auth-errors'
import { Feedback, Loading } from './ui'

type Mode = 'login' | 'register' | 'forgot' | 'reset'
const headings: Record<Mode, [string, string]> = {
  login: ['С возвращением!', 'Войди, чтобы продолжить поиск.'],
  register: ['Добро пожаловать!', 'Создай аккаунт и подтверди школьный доступ.'],
  forgot: ['Забыли пароль?', 'Отправим ссылку для восстановления доступа.'],
  reset: ['Новый пароль', 'Выбери надёжный пароль для своего аккаунта.'],
}

export function AuthPage({ mode }: { mode: Mode }) {
  const auth = useAuth(), navigate = useNavigate(), location = useLocation()
  const [email, setEmail] = useState(''), [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState(''), [name, setName] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [updated, setUpdated] = useState(false)
  const register = mode === 'register', reset = mode === 'reset', forgot = mode === 'forgot'
  const from = typeof location.state?.from === 'string' && /^\/app(?:\/|\?|$)/.test(location.state.from) ? location.state.from : '/app/dashboard'
  const callbackFailed = new URLSearchParams(location.hash.slice(1)).has('error') || new URLSearchParams(location.search).has('error')
  useEffect(() => { if (auth.profile && !auth.recovering && mode === 'login') navigate(from, { replace: true }) }, [auth.profile, auth.recovering, mode, from, navigate])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase || busy) return
    setError(''); setNotice('')
    if ((register || reset) && password !== confirm) { setError('Пароли не совпадают. Проверь оба поля.'); return }
    setBusy(true)
    try {
      if (forgot) {
        const result = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` })
        if (result.error) throw result.error
        setNotice('Если для этого email есть аккаунт, мы отправим ссылку. Проверь входящие и папку «Спам».')
      } else if (reset) {
        if (!auth.session) { setError('Открой действующую ссылку из письма для восстановления.'); return }
        const result = await supabase.auth.updateUser({ password })
        if (result.error) throw result.error
        setPassword(''); setConfirm(''); setUpdated(true)
        const signedOut = await supabase.auth.signOut()
        setNotice(signedOut.error ? 'Пароль изменён. Не удалось завершить сеанс — нажми «Выйти» перед входом с новым паролем.' : 'Пароль изменён. Теперь можно войти с новым паролем.')
      } else if (register) {
        const result = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim() }, emailRedirectTo: `${window.location.origin}/login` } })
        if (result.error) throw result.error
        setPassword(''); setConfirm('')
        setNotice('Проверь почту и подтверди email по ссылке. Если аккаунт уже есть, войди или восстанови пароль. Доступ к школе выдаёт администратор.')
      } else {
        const result = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (result.error) throw result.error
        setPassword('')
      }
    } catch (err) { setError(authError(err)) }
    finally { setBusy(false) }
  }

  return <section className="container auth-page">
    <aside className="auth-aside"><span className="eyebrow"><ShieldCheck size={17} aria-hidden="true" /> СВОЁ ШКОЛЬНОЕ СООБЩЕСТВО</span><h2>Помогаем вещам<br />вернуться домой.</h2><p>Объявления доступны только участникам школы. Особые приметы для возврата видят только автор заявки и сотрудник.</p><div className="auth-assurance"><LockKeyhole size={22} aria-hidden="true" /><span>Пароли обрабатывает Supabase.<br />Мы не сохраняем их в приложении.</span></div></aside>
    <div className="form-panel auth-panel">
      <Link className="back-link" to="/"><ArrowLeft size={16} aria-hidden="true" /> На главную</Link>
      <div className="form-heading"><span className="form-symbol">{forgot || reset ? <KeyRound aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}</span><h1>{headings[mode][0]}</h1><p>{headings[mode][1]}</p></div>
      {!supabase ? <div className="setup-state" role="status"><ShieldCheck size={24} aria-hidden="true" /><h2>Подключение к школе ещё не настроено</h2><p>Вход, регистрация и восстановление пароля пока недоступны. Мы откроем доступ после подключения школьного сервиса.</p></div> : <>
        {callbackFailed && <Feedback error="Ссылка недействительна или устарела. Запроси новое письмо для восстановления или обратись к сотруднику школы." />}
        {notice && <div className="feedback" role="status"><Mail size={20} aria-hidden="true" />{notice}</div>}
        {reset && auth.loading && !updated ? <Loading /> : reset && !auth.session && !updated ? <div className="form-note">Для смены пароля открой ссылку из письма. <Link to="/forgot-password">Запросить новую ссылку</Link></div> : !updated && !callbackFailed && <form onSubmit={submit} aria-busy={busy}>
          <fieldset disabled={busy}>
            {register && <><label className="field-label" htmlFor="name">Имя</label><input id="name" className="field" autoComplete="given-name" value={name} onChange={e => setName(e.target.value)} required maxLength={80} /></>}
            {!reset && <><label className="field-label" htmlFor="email">Email</label><input id="email" className="field" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></>}
            {!forgot && <><label className="field-label" htmlFor="password">{reset ? 'Новый пароль' : 'Пароль'}</label><input id="password" className="field" type="password" autoComplete={register || reset ? 'new-password' : 'current-password'} required minLength={register || reset ? 12 : 1} value={password} onChange={e => setPassword(e.target.value)} aria-describedby={register || reset ? 'password-help' : undefined} />{(register || reset) && <p id="password-help" className="field-help">Не менее 12 символов. Не используй пароль от других аккаунтов.</p>}</>}
            {(register || reset) && <><label className="field-label" htmlFor="password-confirm">Повтори пароль</label><input id="password-confirm" className="field" type="password" autoComplete="new-password" required minLength={12} value={confirm} onChange={e => setConfirm(e.target.value)} /></>}
            <Feedback error={error || (!reset && !forgot ? auth.error : '')} />
            <button className="btn btn-primary submit-btn" disabled={busy}>{busy ? 'Подождите…' : register ? 'Зарегистрироваться' : forgot ? 'Отправить ссылку' : reset ? 'Сохранить пароль' : 'Войти'}<ArrowRight size={17} aria-hidden="true" /></button>
          </fieldset>
        </form>}
      </>}
      <div className="auth-links">{mode === 'login' ? <><Link to="/forgot-password">Забыли пароль?</Link><Link to="/register">Нет аккаунта? Зарегистрироваться</Link></> : <Link to="/login">{register ? 'Уже есть аккаунт? Войти' : 'Вернуться ко входу'}</Link>}</div>
    </div>
  </section>
}
