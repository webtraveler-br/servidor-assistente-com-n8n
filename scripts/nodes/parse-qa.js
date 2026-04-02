// General QA — Parse QA node
// Parses OpenRouter LLM response and sanitizes Markdown for Telegram

function sanitizeMd(text) {
  let t = String(text);
  // Ensure bold markers (*) are properly paired
  const stars = (t.match(/(?<!\\)\*/g) || []);
  if (stars.length % 2 !== 0) {
    // Find the last unpaired * and escape it
    const lastIdx = t.lastIndexOf('*');
    t = t.substring(0, lastIdx) + '\\*' + t.substring(lastIdx + 1);
  }
  // Ensure italic markers (_) are properly paired
  const underscores = (t.match(/(?<!\\)_/g) || []);
  if (underscores.length % 2 !== 0) {
    const lastIdx = t.lastIndexOf('_');
    t = t.substring(0, lastIdx) + '\\_' + t.substring(lastIdx + 1);
  }
  // Ensure code markers (`) are properly paired (ignore triple backticks)
  const singles = (t.match(/(?<!`)(?<!\\)`(?!`)/g) || []);
  if (singles.length % 2 !== 0) {
    const lastIdx = t.lastIndexOf('`');
    t = t.substring(0, lastIdx) + '\\`' + t.substring(lastIdx + 1);
  }
  // Escape unmatched [ without ]
  t = t.replace(/\[(?![^\]]*\])/g, '\\[');
  return t;
}

const data = $input.first().json;
if (!data.choices || data.choices.length === 0) {
  const errMsg = data.error && data.error.message ? data.error.message : 'Erro desconhecido';
  return [{ json: { text: `Erro no OpenRouter: ${sanitizeMd(errMsg)}` } }];
}
const raw = data.choices[0].message.content;
return [{ json: { text: sanitizeMd(raw) } }];
