// Never render provider messages, tokens or account-existence details verbatim.
export function authError(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
  switch (code) {
    case 'email_not_confirmed': return 'Подтверди email по ссылке в письме, затем войди снова.'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit': return 'Слишком много попыток. Подожди немного и попробуй снова.'
    case 'weak_password': return 'Выбери более надёжный пароль: не менее 12 символов.'
    case 'same_password': return 'Новый пароль должен отличаться от прежнего.'
    case 'otp_expired': return 'Ссылка недействительна или устарела. Запроси новое письмо.'
    case 'invalid_credentials': return 'Не удалось войти. Проверь email и пароль.'
    default: return 'Не удалось выполнить действие. Проверь подключение и попробуй ещё раз.'
  }
}
