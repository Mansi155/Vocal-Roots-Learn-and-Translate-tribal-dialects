// Whitespace tokenizing (not \w, which would split Devanagari words at vowel signs)
// plus greedy longest-phrase matching, so entries like "ka lawm e" work.
const EDGE = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu;

function tokenize(text) {
  return String(text).toLowerCase().split(/\s+/).map((t) => t.replace(EDGE, '')).filter(Boolean).slice(0, 60);
}

// table: Map(phrase -> concept). Returns [{ phrase, concept|null }]
function matchPhrases(tokens, table, maxWords = 3) {
  const out = [];
  for (let i = 0; i < tokens.length;) {
    let hit = null;
    for (let n = Math.min(maxWords, tokens.length - i); n >= 1 && !hit; n--) {
      const phrase = tokens.slice(i, i + n).join(' ');
      if (table.has(phrase)) hit = { phrase, concept: table.get(phrase), n };
    }
    if (hit) { out.push({ phrase: hit.phrase, concept: hit.concept }); i += hit.n; }
    else { out.push({ phrase: tokens[i], concept: null }); i += 1; }
  }
  return out;
}

module.exports = { tokenize, matchPhrases };
