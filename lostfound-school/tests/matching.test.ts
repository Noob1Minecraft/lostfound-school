import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchScore } from '../src/data.ts'
import { explainMatch, matchLevel } from '../shared/matching.ts'

const lost = { id: 'a', type: 'lost' as const, title: 'Первое', category: 'Электроника' as const, color: 'Чёрный', location: 'Библиотека', date: '2026-11-10', description: 'Наушники, чехол.', emoji: '🎧' }
const found = { ...lost, id: 'b', type: 'found' as const, title: 'Второе', description: 'НАУШНИКИ! Чехол.' }
test('description keywords, punctuation and case produce full 100 points', () => assert.equal(matchScore(lost, found), 100))
test('same type and same item never match', () => { assert.equal(matchScore(lost, lost), 0); assert.equal(matchScore(lost, { ...found, type: 'lost' }), 0) })
test('three-day proximity is inclusive, four days loses 15', () => { assert.equal(matchScore(lost, {...found, date: '2026-11-13'}), 100); assert.equal(matchScore(lost, {...found, date: '2026-11-14'}), 85) })
test('no shared attributes gives zero even if titles are identical', () => assert.equal(matchScore(lost, { ...found, title: lost.title, category: 'Одежда', color: 'Белый', location: 'Спортзал', date: '2026-10-01', description: 'Куртка синяя' }), 0))
test('blank attributes never count as a match', () => assert.equal(matchScore({...lost, color:'',location:'',description:'',date:''}, {...found,color:'',location:'',description:'',date:''}), 30))
test('threshold boundaries are 40 and 70',()=>{for(const [score,level] of [[0,'low'],[39,'low'],[40,'possible'],[69,'possible'],[70,'high'],[100,'high']] as const)assert.equal(matchLevel(score),level)})
test('explanations report each earned contribution and scores are symmetric',()=>{assert.equal(explainMatch(lost,found).reasons.length,5);assert.equal(explainMatch(lost,found).level,'high');assert.equal(matchScore(found,lost),100)})
