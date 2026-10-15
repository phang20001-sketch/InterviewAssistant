'use strict';

const NUMBER_KEYS = [
  'number',
  'questionNumber',
  'question_number',
  'questionNo',
  'question_no',
  '题号',
  '编号',
  'id',
];
const ANSWER_KEYS = ['answer', 'finalAnswer', 'final_answer', '答案', '最终答案'];
const ROOT_KEYS = ['answers', '答案', 'results', '题目答案'];

function field(object, keys) {
  const present = keys.filter((key) => Object.hasOwn(object, key));
  if (!present.length) return undefined;
  const value = object[present[0]];
  return present.every((key) => JSON.stringify(object[key]) === JSON.stringify(value))
    ? value
    : undefined;
}

function answerText(value) {
  if (typeof value === 'string') return value.trim() ? value : null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  if (
    Array.isArray(value) &&
    value.length &&
    value.every((item) => typeof item === 'string' && /^[A-Za-z]$/.test(item.trim()))
  ) {
    return value.map((item) => item.trim()).join('');
  }
  return null;
}

function formatItems(value) {
  let items = value;
  if (!Array.isArray(items)) {
    if (!items || typeof items !== 'object') return null;
    const keys = Object.keys(items);
    if (keys.length !== 1 || !ROOT_KEYS.includes(keys[0])) return null;
    items = items[keys[0]];
  }
  if (!Array.isArray(items) || !items.length) return null;

  const lines = [];
  for (const item of items) {
    if (!item || Array.isArray(item) || typeof item !== 'object') return null;
    if (Object.keys(item).some((key) => !NUMBER_KEYS.includes(key) && !ANSWER_KEYS.includes(key)))
      return null;
    const number = field(item, NUMBER_KEYS);
    const label =
      typeof number === 'string'
        ? number.trim().replace(/[.、:：．]+$/u, '')
        : Number.isSafeInteger(number) && number >= 0
          ? String(number)
          : '';
    const answer = answerText(field(item, ANSWER_KEYS));
    const isNumber =
      /[0-9０-９一二三四五六七八九十百千零〇两ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/u.test(label) ||
      /^[A-Za-z]$/.test(label) ||
      /^(?=[IVXLCDM]+$)M{0,4}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/i.test(label);
    if (!label || label.length > 32 || /[\r\n]/.test(label) || !isNumber || answer === null)
      return null;
    lines.push(`${label}. ${answer}`);
  }
  return lines.join('\n');
}

function parseScreenAnswers(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(text);
  try {
    // Format only a complete answer structure. Extra fields or surrounding prose
    // can contain meaningful content, so retain the original response in full.
    const formatted = formatItems(JSON.parse(fenced ? fenced[1] : text));
    return formatted ?? value;
  } catch {
    return value;
  }
}

module.exports = { parseScreenAnswers };
