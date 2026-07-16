/**
 * Deterministic, dependency-free detectors for natural-person data in STRING
 * VALUES. No NER/NLP/AI and no dictionary of first/last names — every rule is a
 * fixed pattern or a role-phrase + capitalized-bigram rule that is naturally
 * low-false-positive (see personalDataPolicy.ts for path-aware allowlisting and
 * key rules).
 *
 * None of these functions ever returns the offending value; callers must map a
 * positive result to a stable rule code + safe path only.
 */

/** Length-preserving diacritic fold (keeps indices aligned with the original). */
const DIACRITIC_MAP: Readonly<Record<string, string>> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
};

export function foldDiacritics(value: string): string {
  let out = "";
  for (const ch of value.toLowerCase()) out += DIACRITIC_MAP[ch] ?? ch;
  return out;
}

/** Uppercase-initial word, Polish-aware (used to spot proper-name bigrams). */
const NAME_WORD = "[A-ZŻŹĆŃÓŁĘĄŚ][a-zżźćńółęąś]+";
const NAME_BIGRAM_RE = new RegExp(`^${NAME_WORD}[ -]${NAME_WORD}`);

/**
 * Non-person words (folded, lower-case): the OPPOSITE of a name dictionary. Used
 * both to (a) suppress false positives on business bigrams after a role word and
 * (b) act as the allowed "qualifier" tokens permitted between a role and a name
 * (e.g. "Prezes Zarządu: …", "Dyrektor sprzedaży: …"). This is NOT generic
 * capitalized-pair detection — only these explicit org/connector tokens qualify.
 */
const NON_PERSON_TOKENS: ReadonlySet<string> = new Set([
  // Org / business words
  "handlowy", "handlowa", "handlowe", "sprzedazy", "sprzedaz", "sales", "team",
  "group", "grupa", "dzial", "dzialu", "department", "marketing", "biuro",
  "office", "region", "oddzial", "spolka", "spolki", "sp", "systems",
  "solutions", "services", "technologies", "consulting", "logistics",
  "transport", "miejski", "miejska", "miejskie", "miejskiej", "publiczny",
  "publiczna", "co", "inc", "ltd", "llc", "gmbh", "sa", "zarzad", "zarzadu",
  "firma", "firmy", "przedsiebiorstwo", "zaklad", "fabryka", "produkcja",
  "produkcji", "uslug", "uslugi", "division", "unit", "company",
  // Role qualifiers / connectors
  "of", "the", "and", "ds", "do", "spraw", "rady", "nadzorczej", "generalny",
  "generalna", "generalnego", "wykonawczy", "wykonawcza", "operacyjny",
  "operacyjna", "finansowy", "finansowa", "commercial", "executive", "officer",
  "general", "managing", "operating", "financial", "board", "management",
]);

/** Role terms (folded, lower-case) that, next to a person name, denote a person. */
const ROLE_TERMS: readonly string[] = [
  // Polish (folded)
  "prezes", "wiceprezes", "zalozyciel", "wspolzalozyciel", "wlasciciel",
  "dyrektor", "kierownik", "prokurent", "pelnomocnik", "przedstawiciel",
  "udzialowiec", "akcjonariusz", "czlonek zarzadu", "czlonek rady",
  "osoba kontaktowa", "kontakt",
  // English
  "chief executive officer", "chief financial officer", "chief operating officer",
  "chief technology officer", "chief marketing officer",
  "ceo", "cfo", "cto", "coo", "founder", "co-founder", "owner", "president",
  "chairman", "director", "manager", "contact person", "contact",
  "member of the board", "board member", "representative", "proxy",
  "shareholder",
];

/**
 * Separators allowed around role/qualifiers/name: whitespace, colon, comma, dot,
 * hyphen, en-dash (U+2013), em-dash (U+2014).
 */
const SEP = "[\\s:.,\\u2013\\u2014-]+";

/**
 * Consumes an OPTIONAL, bounded (<= 3) run of approved qualifier tokens plus the
 * separators around them, ending on the separator that precedes the name. Built
 * once from NON_PERSON_TOKENS (longest-first so `\b` never mis-anchors).
 */
const QUALIFIER_CONSUME_RE = (() => {
  const alt = [...NON_PERSON_TOKENS].sort((a, b) => b.length - a.length).join("|");
  return new RegExp(`^(?:${SEP}(?:${alt})\\b){0,3}${SEP}`);
})();

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

/** 11 consecutive digits not embedded in a longer digit run (PESEL shape). */
const PESEL_RE = /(?<!\d)\d{11}(?!\d)/;

/** A run of phone-ish characters; a hit requires >= 9 actual digits. */
const PHONE_CANDIDATE_RE = /[+(]?\d[\d\s().+-]{7,}\d/g;

export function containsEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

export function containsPesel(value: string): boolean {
  return PESEL_RE.test(value);
}

export function containsPhone(value: string): boolean {
  const matches = value.match(PHONE_CANDIDATE_RE);
  if (!matches) return false;
  for (const m of matches) {
    const digits = m.replace(/\D/g, "").length;
    if (digits >= 9) return true;
  }
  return false;
}

/**
 * Conservative, deterministic personal-profile URL detection. Only clearly
 * individual profile paths are rejected; bare platform origins (which may be a
 * company page) are never rejected here.
 */
const PERSONAL_PROFILE_RES: readonly RegExp[] = [
  /\blinkedin\.com\/(?:in|pub)\//i,
  /\bfacebook\.com\/(?:profile\.php|people\/)/i,
  /\b(?:x|twitter)\.com\/@[a-z0-9_.]+/i,
  /\b(?:x|twitter)\.com\/(?:i\/user|intent\/user)\b/i,
];

export function containsPersonalProfileUrl(value: string): boolean {
  return PERSONAL_PROFILE_RES.some((re) => re.test(value));
}

function isPersonName(word: string): boolean {
  return !NON_PERSON_TOKENS.has(foldDiacritics(word));
}

/**
 * True when a role term is followed — after an OPTIONAL bounded run of approved
 * qualifier tokens and separators — by a capitalized proper-name bigram:
 *   "CEO Jan Kowalski", "Kontakt: Anna Nowak", "member of the board John Smith",
 *   "Prezes Zarządu: Jan Kowalski", "Dyrektor sprzedaży: Jan Kowalski",
 *   "Chief Executive Officer: John Smith".
 *
 * Conservative by construction: the role must be a whole word, only explicit
 * qualifier tokens (max 3) may sit between role and name, and BOTH name words
 * must be outside the non-person token set — so "Kontakt Handlowy Warszawa",
 * "Chief Executive Officer software" and "system dla dyrektora sprzedaży" are NOT
 * flagged. It never returns or exposes the matched value.
 */
export function containsPersonRolePhrase(value: string): boolean {
  const folded = foldDiacritics(value); // length-preserving → indices align
  for (const role of ROLE_TERMS) {
    let idx = folded.indexOf(role);
    while (idx !== -1) {
      const before = idx === 0 ? "" : folded[idx - 1];
      const leftBoundary = before === "" || !/[a-z0-9]/.test(before);
      if (leftBoundary) {
        const afterEnd = idx + role.length;
        const nextChar = folded[afterEnd] ?? "";
        // Whole word on the right: a separator (never another letter/digit).
        if (nextChar === "" || !/[a-z0-9]/.test(nextChar)) {
          const consumed = QUALIFIER_CONSUME_RE.exec(folded.slice(afterEnd));
          if (consumed) {
            const nameCandidate = value.slice(afterEnd + consumed[0].length);
            const m = NAME_BIGRAM_RE.exec(nameCandidate);
            if (m) {
              const [first, second] = m[0].split(/[ -]/);
              if (isPersonName(first) && isPersonName(second)) return true;
            }
          }
        }
      }
      idx = folded.indexOf(role, idx + 1);
    }
  }
  return false;
}
