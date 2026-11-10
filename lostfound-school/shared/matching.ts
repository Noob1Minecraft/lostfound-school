import type { ItemInput } from './domain.ts'
type Candidate = ItemInput & { id: string }
const normalize = (s: string) => s.trim().toLocaleLowerCase('ru').replace(/ё/g, 'е')
const stopWords = new Set(['после','перед','около','найден','найдена','потерян','потеряна','вещь','этот','была','были'])
function words(s: string) { return new Set((normalize(s).match(/[\p{L}\p{N}]+/gu) ?? []).filter(w => w.length >= 4 && !stopWords.has(w))) }
export function matchLevel(score: number): 'high' | 'possible' | 'low' { return score >= 70 ? 'high' : score >= 40 ? 'possible' : 'low' }
export function explainMatch(a: Candidate, b: Candidate) {
  let score = 0
  const reasons: string[] = []
  function add(condition: boolean, points: number, reason: string) { if (condition) { score += points; reasons.push(`${reason}: +${points}`) } }
  if (a.id === b.id || a.type === b.type) return { score, reasons, level: matchLevel(score) }
  add(Boolean(a.category) && a.category === b.category, 30, 'Категория')
  add(Boolean(normalize(a.color)) && normalize(a.color) === normalize(b.color), 20, 'Цвет')
  add(Boolean(normalize(a.location)) && normalize(a.location) === normalize(b.location), 20, 'Место')
  const distance = Math.abs(Date.parse(a.date) - Date.parse(b.date))
  add(Number.isFinite(distance) && distance <= 3 * 86400000, 15, 'Даты в пределах 3 дней')
  const aWords = words(a.description)
  add([...words(b.description)].some(w => aWords.has(w)), 15, 'Общие слова в описании')
  return { score, reasons, level: matchLevel(score) }
}
export function matchScore(a: Candidate, b: Candidate) { return explainMatch(a, b).score }
