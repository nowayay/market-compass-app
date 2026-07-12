// MarketCompass — reference data + scoring engine (prototype, illustrative figures)

import type { Company, Country, Profile, ScoredResult, Swot } from "../types";

export const REGIONS = [
  { id: 'europe', label: 'Europa' },
  { id: 'namerica', label: 'Ameryka Północna' },
  { id: 'samerica', label: 'Ameryka Południowa' },
  { id: 'asia', label: 'Azja' },
  { id: 'africa', label: 'Afryka' },
  { id: 'oceania', label: 'Australia i Oceania' },
];

export const INDUSTRIES = [
  'Produkcja i przemysł', 'Handel detaliczny', 'E-commerce', 'Technologie / IT / SaaS',
  'Żywność i napoje', 'Moda i dobra konsumenckie', 'Usługi B2B', 'Motoryzacja',
  'Budownictwo i materiały', 'Zdrowie i farmacja', 'Logistyka i transport', 'Energetyka', 'Inne',
];

export const GOALS = [
  'Zwiększenie sprzedaży', 'Pozyskanie nowych klientów', 'Znalezienie dystrybutorów',
  'Otwarcie oddziału', 'Uruchomienie produkcji', 'Inny',
];

// x,y = approximate equirectangular position in % (0-100) for bubble-map placement
export const COUNTRIES: Country[] = [
  { id: 'us', flag: '🇺🇸', iso3: 'USA', name: 'Stany Zjednoczone', continent: 'namerica', x: 21, y: 36, gdp: 27.4, gdpPc: 81600, inflation: 3.1, tax: 21, stability: 68, corruption: 69, digital: 82, internet: 92, unemployment: 3.9, growth: 2.5, marketSize: 100, competition: 92, laborCost: 78, tariff: 3.4, infra: 88, trade: 'USMCA' },
  { id: 'ca', flag: '🇨🇦', iso3: 'CAN', name: 'Kanada', continent: 'namerica', x: 19, y: 23, gdp: 2.2, gdpPc: 54900, inflation: 2.9, tax: 26.5, stability: 84, corruption: 76, digital: 80, internet: 93, unemployment: 5.8, growth: 1.6, marketSize: 58, competition: 65, laborCost: 68, tariff: 1.3, infra: 84, trade: 'USMCA, CETA' },
  { id: 'mx', flag: '🇲🇽', iso3: 'MEX', name: 'Meksyk', continent: 'namerica', x: 16, y: 43, gdp: 1.8, gdpPc: 13800, inflation: 4.4, tax: 30, stability: 45, corruption: 31, digital: 58, internet: 78, unemployment: 2.8, growth: 2.4, marketSize: 62, competition: 55, laborCost: 32, tariff: 5.8, infra: 55, trade: 'USMCA' },
  { id: 'br', flag: '🇧🇷', iso3: 'BRA', name: 'Brazylia', continent: 'samerica', x: 32, y: 63, gdp: 2.3, gdpPc: 10800, inflation: 4.6, tax: 34, stability: 48, corruption: 36, digital: 60, internet: 81, unemployment: 7.8, growth: 2.1, marketSize: 68, competition: 58, laborCost: 30, tariff: 11.4, infra: 52, trade: 'Mercosur' },
  { id: 'ar', flag: '🇦🇷', iso3: 'ARG', name: 'Argentyna', continent: 'samerica', x: 29, y: 76, gdp: 0.6, gdpPc: 13700, inflation: 140, tax: 35, stability: 40, corruption: 37, digital: 63, internet: 87, unemployment: 6.1, growth: -1.5, marketSize: 42, competition: 44, laborCost: 24, tariff: 13.4, infra: 46, trade: 'Mercosur' },
  { id: 'uk', flag: '🇬🇧', iso3: 'GBR', name: 'Wielka Brytania', continent: 'europe', x: 47, y: 27, gdp: 3.5, gdpPc: 51100, inflation: 2.6, tax: 25, stability: 74, corruption: 71, digital: 84, internet: 96, unemployment: 4.2, growth: 1.1, marketSize: 76, competition: 80, laborCost: 70, tariff: 2.1, infra: 82, trade: 'UK-EU TCA' },
  { id: 'fr', flag: '🇫🇷', iso3: 'FRA', name: 'Francja', continent: 'europe', x: 49, y: 30, gdp: 3.1, gdpPc: 46300, inflation: 2.5, tax: 25.8, stability: 66, corruption: 71, digital: 79, internet: 91, unemployment: 7.3, growth: 1.0, marketSize: 74, competition: 78, laborCost: 74, tariff: 0, infra: 85, trade: 'UE' },
  { id: 'de', flag: '🇩🇪', iso3: 'DEU', name: 'Niemcy', continent: 'europe', x: 51, y: 27, gdp: 4.7, gdpPc: 54100, inflation: 2.4, tax: 29.8, stability: 78, corruption: 78, digital: 81, internet: 94, unemployment: 3.4, growth: 0.4, marketSize: 82, competition: 84, laborCost: 76, tariff: 0, infra: 90, trade: 'UE' },
  { id: 'it', flag: '🇮🇹', iso3: 'ITA', name: 'Włochy', continent: 'europe', x: 51, y: 34, gdp: 2.3, gdpPc: 39000, inflation: 1.9, tax: 27.8, stability: 60, corruption: 56, digital: 68, internet: 88, unemployment: 7.4, growth: 0.7, marketSize: 65, competition: 72, laborCost: 62, tariff: 0, infra: 74, trade: 'UE' },
  { id: 'es', flag: '🇪🇸', iso3: 'ESP', name: 'Hiszpania', continent: 'europe', x: 46, y: 33, gdp: 1.6, gdpPc: 33700, inflation: 3.2, tax: 25, stability: 62, corruption: 60, digital: 72, internet: 93, unemployment: 11.8, growth: 2.4, marketSize: 60, competition: 66, laborCost: 52, tariff: 0, infra: 78, trade: 'UE' },
  { id: 'nl', flag: '🇳🇱', iso3: 'NLD', name: 'Holandia', continent: 'europe', x: 50, y: 26, gdp: 1.1, gdpPc: 62900, inflation: 3.0, tax: 25.8, stability: 82, corruption: 79, digital: 88, internet: 96, unemployment: 3.6, growth: 0.6, marketSize: 52, competition: 68, laborCost: 79, tariff: 0, infra: 92, trade: 'UE' },
  { id: 'be', flag: '🇧🇪', iso3: 'BEL', name: 'Belgia', continent: 'europe', x: 49, y: 27, gdp: 0.65, gdpPc: 54800, inflation: 2.3, tax: 25, stability: 74, corruption: 73, digital: 79, internet: 93, unemployment: 5.6, growth: 1.0, marketSize: 44, competition: 62, laborCost: 77, tariff: 0, infra: 87, trade: 'UE' },
  { id: 'ch', flag: '🇨🇭', iso3: 'CHE', name: 'Szwajcaria', continent: 'europe', x: 50, y: 30, gdp: 0.9, gdpPc: 102000, inflation: 1.2, tax: 14.9, stability: 90, corruption: 82, digital: 87, internet: 96, unemployment: 2.1, growth: 1.3, marketSize: 45, competition: 60, laborCost: 92, tariff: 0.9, infra: 94, trade: 'EFTA' },
  { id: 'at', flag: '🇦🇹', iso3: 'AUT', name: 'Austria', continent: 'europe', x: 52, y: 29, gdp: 0.55, gdpPc: 55800, inflation: 3.3, tax: 24, stability: 79, corruption: 71, digital: 78, internet: 92, unemployment: 5.1, growth: 0.5, marketSize: 40, competition: 58, laborCost: 74, tariff: 0, infra: 88, trade: 'UE' },
  { id: 'se', flag: '🇸🇪', iso3: 'SWE', name: 'Szwecja', continent: 'europe', x: 52, y: 19, gdp: 0.6, gdpPc: 56500, inflation: 2.1, tax: 20.6, stability: 85, corruption: 82, digital: 89, internet: 96, unemployment: 8.0, growth: 1.2, marketSize: 42, competition: 55, laborCost: 78, tariff: 0, infra: 91, trade: 'UE' },
  { id: 'ie', flag: '🇮🇪', iso3: 'IRL', name: 'Irlandia', continent: 'europe', x: 44, y: 26, gdp: 0.55, gdpPc: 103800, inflation: 1.9, tax: 12.5, stability: 82, corruption: 77, digital: 83, internet: 92, unemployment: 4.4, growth: 3.2, marketSize: 34, competition: 48, laborCost: 71, tariff: 0, infra: 80, trade: 'UE' },
  { id: 'pl', flag: '🇵🇱', iso3: 'POL', name: 'Polska', continent: 'europe', x: 53, y: 25, gdp: 0.84, gdpPc: 22300, inflation: 3.7, tax: 19, stability: 66, corruption: 55, digital: 71, internet: 90, unemployment: 2.9, growth: 3.1, marketSize: 55, competition: 60, laborCost: 40, tariff: 0, infra: 76, trade: 'UE' },
  { id: 'tr', flag: '🇹🇷', iso3: 'TUR', name: 'Turcja', continent: 'europe', x: 57, y: 35, gdp: 1.1, gdpPc: 12800, inflation: 48, tax: 25, stability: 42, corruption: 34, digital: 62, internet: 84, unemployment: 9.0, growth: 3.2, marketSize: 64, competition: 62, laborCost: 30, tariff: 4.8, infra: 62, trade: 'UE (unia celna)' },
  { id: 'ru', flag: '🇷🇺', iso3: 'RUS', name: 'Rosja', continent: 'europe', x: 66, y: 17, gdp: 2.2, gdpPc: 15300, inflation: 7.5, tax: 20, stability: 22, corruption: 26, digital: 68, internet: 89, unemployment: 3.0, growth: 1.0, marketSize: 66, competition: 40, laborCost: 34, tariff: 6.8, infra: 58, trade: 'EAEU' },
  { id: 'sa', flag: '🇸🇦', iso3: 'SAU', name: 'Arabia Saudyjska', continent: 'asia', x: 60, y: 43, gdp: 1.1, gdpPc: 30400, inflation: 2.2, tax: 20, stability: 55, corruption: 51, digital: 74, internet: 99, unemployment: 4.9, growth: 3.4, marketSize: 56, competition: 44, laborCost: 44, tariff: 5.5, infra: 78, trade: 'GCC' },
  { id: 'ae', flag: '🇦🇪', iso3: 'ARE', name: 'Zjednoczone Emiraty Arabskie', continent: 'asia', x: 63, y: 44, gdp: 0.55, gdpPc: 53700, inflation: 2.0, tax: 9, stability: 74, corruption: 68, digital: 85, internet: 99, unemployment: 2.5, growth: 4.0, marketSize: 46, competition: 52, laborCost: 52, tariff: 5.0, infra: 90, trade: 'GCC' },
  { id: 'il', flag: '🇮🇱', iso3: 'ISR', name: 'Izrael', continent: 'asia', x: 57, y: 39, gdp: 0.53, gdpPc: 55600, inflation: 3.0, tax: 23, stability: 38, corruption: 63, digital: 84, internet: 90, unemployment: 3.2, growth: 2.0, marketSize: 40, competition: 58, laborCost: 66, tariff: 2.6, infra: 79, trade: 'UE, USA' },
  { id: 'ng', flag: '🇳🇬', iso3: 'NGA', name: 'Nigeria', continent: 'africa', x: 50, y: 51, gdp: 0.36, gdpPc: 1600, inflation: 31, tax: 30, stability: 30, corruption: 25, digital: 42, internet: 55, unemployment: 5.0, growth: 3.3, marketSize: 60, competition: 34, laborCost: 12, tariff: 12.0, infra: 38, trade: 'AfCFTA' },
  { id: 'in', flag: '🇮🇳', iso3: 'IND', name: 'Indie', continent: 'asia', x: 69, y: 43, gdp: 3.9, gdpPc: 2700, inflation: 5.0, tax: 25.2, stability: 47, corruption: 40, digital: 60, internet: 52, unemployment: 4.2, growth: 6.8, marketSize: 92, competition: 70, laborCost: 14, tariff: 17.6, infra: 58, trade: 'brak z UE' },
  { id: 'cn', flag: '🇨🇳', iso3: 'CHN', name: 'Chiny', continent: 'asia', x: 77, y: 31, gdp: 18.5, gdpPc: 13100, inflation: 0.5, tax: 25, stability: 62, corruption: 42, digital: 78, internet: 76, unemployment: 5.1, growth: 4.8, marketSize: 98, competition: 96, laborCost: 26, tariff: 7.5, infra: 84, trade: 'RCEP' },
  { id: 'jp', flag: '🇯🇵', iso3: 'JPN', name: 'Japonia', continent: 'asia', x: 87, y: 32, gdp: 4.2, gdpPc: 33800, inflation: 2.8, tax: 29.7, stability: 82, corruption: 73, digital: 76, internet: 93, unemployment: 2.5, growth: 1.0, marketSize: 78, competition: 82, laborCost: 62, tariff: 2.5, infra: 92, trade: 'CPTPP, RCEP' },
  { id: 'kr', flag: '🇰🇷', iso3: 'KOR', name: 'Korea Południowa', continent: 'asia', x: 83, y: 32, gdp: 1.8, gdpPc: 34900, inflation: 2.3, tax: 25, stability: 70, corruption: 63, digital: 87, internet: 97, unemployment: 2.9, growth: 2.2, marketSize: 62, competition: 74, laborCost: 54, tariff: 6.0, infra: 91, trade: 'UE, USA' },
  { id: 'id', flag: '🇮🇩', iso3: 'IDN', name: 'Indonezja', continent: 'asia', x: 79, y: 54, gdp: 1.4, gdpPc: 4900, inflation: 2.8, tax: 22, stability: 55, corruption: 34, digital: 52, internet: 68, unemployment: 5.3, growth: 5.0, marketSize: 70, competition: 48, laborCost: 16, tariff: 8.1, infra: 50, trade: 'RCEP' },
  { id: 'th', flag: '🇹🇭', iso3: 'THA', name: 'Tajlandia', continent: 'asia', x: 75, y: 47, gdp: 0.52, gdpPc: 7300, inflation: 1.0, tax: 20, stability: 44, corruption: 35, digital: 58, internet: 85, unemployment: 1.0, growth: 2.8, marketSize: 50, competition: 46, laborCost: 22, tariff: 9.8, infra: 62, trade: 'RCEP' },
  { id: 'au', flag: '🇦🇺', iso3: 'AUS', name: 'Australia', continent: 'oceania', x: 85, y: 71, gdp: 1.7, gdpPc: 64500, inflation: 3.6, tax: 30, stability: 80, corruption: 75, digital: 82, internet: 91, unemployment: 4.0, growth: 1.7, marketSize: 60, competition: 56, laborCost: 80, tariff: 0, infra: 86, trade: 'CPTPP' },
];

const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));

// Deterministic pseudo-random-ish but stable per country+profile seed
function seedFrom(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) % 1000 / 1000;
}

const riskLevelToNum: Record<string, number> = { niski: 30, sredni: 55, wysoki: 80 };

export function scoreCountry(company: Company, c: Country): ScoredResult {
  const regionMatch = (company.regions || []).includes(c.continent) ? 14 : 0;
  const riskTarget = riskLevelToNum[company.riskLevel] ?? 55;
  const riskFit = 100 - Math.abs(riskTarget - (100 - c.stability));
  const budgetNum = Number(company.expansionBudget) || 0;
  const investNeed = clamp(100 - c.laborCost * 0.2 - c.digital * 0.2 + c.competition * 0.3, 10, 95);
  const budgetFit = budgetNum > 0 ? clamp(100 - Math.abs((budgetNum > 500000 ? 80 : budgetNum > 100000 ? 50 : 25) - investNeed) * 0.8, 20, 100) : 55;
  const marketFit = clamp(c.marketSize * 0.5 + (100 - c.competition) * 0.25 + c.growth * 3, 0, 100);
  const econHealth = clamp(c.stability * 0.35 + c.corruption * 0.25 + c.digital * 0.2 + (100 - clamp(c.inflation, 0, 100)) * 0.2, 0, 100);
  const seed = seedFrom((company.name || 'firma') + c.id);
  const jitter = (seed - 0.5) * 6;

  const score = clamp(
    marketFit * 0.32 + econHealth * 0.28 + riskFit * 0.18 + budgetFit * 0.12 + regionMatch + jitter,
    5, 98
  );

  let band: ScoredResult["band"] = score >= 70 ? 'recommended' : score >= 45 ? 'medium' : 'avoid';
  // Hard safety cap: a genuinely unstable/high-risk country can never be labelled "recommended",
  // and a very unstable one is always "avoid" — regardless of other favorable metrics.
  if (c.stability < 25) band = 'avoid';
  else if (c.stability < 45 && band === 'recommended') band = 'medium';
  const risk = c.stability >= 70 && c.corruption >= 65 ? 'Niskie' : c.stability >= 45 ? 'Średnie' : 'Wysokie';
  const profitability = clamp(marketFit * 0.5 + (100 - c.competition) * 0.3 + c.growth * 2, 0, 100);
  const fit = clamp(score + (seed - 0.5) * 4, 0, 100);

  const investmentLevel = investNeed > 65 ? 'Wysoki' : investNeed > 40 ? 'Średni' : 'Niski';
  const investmentRange = investNeed > 65 ? '400 000 – 1 200 000 PLN' : investNeed > 40 ? '150 000 – 450 000 PLN' : '50 000 – 180 000 PLN';

  const strategies = [
    'Wejście przez lokalnego dystrybutora i sieć partnerów handlowych',
    'Sprzedaż bezpośrednia online z lokalnym magazynem fulfillmentowym',
    'Joint venture z lokalnym podmiotem branżowym',
    'Otwarcie przedstawicielstwa handlowego i zespołu sprzedaży',
    'Udział w targach branżowych i budowa sieci kontaktów B2B',
    'Franczyza lub licencjonowanie marki na rynek lokalny',
  ];
  const strategy = strategies[Math.floor(seed * strategies.length)];

  const pros: string[] = [];
  const cons: string[] = [];
  const risks: string[] = [];

  if (c.marketSize > 70) pros.push(`Bardzo duży rynek zbytu (wskaźnik wielkości rynku ${c.marketSize}/100)`);
  else if (c.marketSize > 45) pros.push(`Rynek średniej wielkości o stabilnym popycie (${c.marketSize}/100)`);
  if (c.growth > 3) pros.push(`Dynamiczny wzrost gospodarczy (+${c.growth}% PKB rocznie)`);
  if (c.digital > 70) pros.push(`Wysoki poziom cyfryzacji (${c.digital}/100) ułatwiający sprzedaż online i e-commerce`);
  if (c.corruption > 65) pros.push('Przejrzyste otoczenie regulacyjne i niski poziom korupcji');
  if (c.laborCost < 35) pros.push('Niskie koszty pracy obniżające koszt uruchomienia działalności');
  if (c.tax < 20) pros.push(`Konkurencyjna stawka CIT (${c.tax}%)`);
  if (c.trade && c.trade !== 'brak z UE') pros.push(`Korzystne umowy handlowe (${c.trade}) obniżające bariery celne`);
  if (c.infra > 80) pros.push('Rozwinięta infrastruktura logistyczna i transportowa');

  if (c.competition > 75) cons.push(`Bardzo wysoka konkurencja lokalna i międzynarodowa (${c.competition}/100)`);
  if (c.laborCost > 70) cons.push('Wysokie koszty pracy i prowadzenia działalności');
  if (c.tax > 27) cons.push(`Wysokie obciążenia podatkowe (CIT ${c.tax}%)`);
  if (c.digital < 55) cons.push('Ograniczona infrastruktura cyfrowa utrudniająca sprzedaż online');
  if (c.tariff > 8) cons.push(`Wysokie cła importowe (śr. ${c.tariff}%)`);
  if (c.infra < 55) cons.push('Słabiej rozwinięta infrastruktura logistyczna');
  if (cons.length === 0) cons.push('Brak istotnych barier wejścia poza standardową adaptacją produktu do rynku');

  if (c.stability < 45) risks.push('Podwyższone ryzyko polityczne i regulacyjne');
  if (c.inflation > 10) risks.push(`Wysoka inflacja (${c.inflation}%) wpływająca na siłę nabywczą i marże`);
  if (c.corruption < 40) risks.push('Ryzyko związane z niską przejrzystością instytucji i biurokracją');
  if (c.growth < 0) risks.push('Ryzyko recesji — ujemny wzrost gospodarczy');
  if (risks.length === 0) risks.push('Ryzyko kursowe typowe dla handlu międzynarodowego');
  risks.push('Ryzyko walutowe wynikające z wahań kursu lokalnej waluty');

  const justification = `${c.name} uzyskuje ${Math.round(score)}/100 punktów dzięki ${
    c.marketSize > 60 ? 'dużemu rynkowi zbytu' : 'stabilnym fundamentom gospodarczym'
  } oraz ${riskFit > 60 ? 'dobremu dopasowaniu do zadeklarowanego poziomu ryzyka' : 'umiarkowanemu ryzyku prowadzenia działalności'}. Wzrost PKB na poziomie ${c.growth}% i wskaźnik cyfryzacji ${c.digital}/100 ${
    band === 'recommended' ? 'wspierają rekomendację ekspansji w perspektywie 12–24 miesięcy.' : band === 'medium' ? 'wskazują na potencjał wymagający dalszej walidacji rynkowej.' : 'sugerują, że rynek ten powinien być rozważany dopiero w dalszej kolejności.'
  }`;

  return {
    country: c, score: Math.round(score), band, risk, marketPotential: Math.round(marketFit),
    profitability: Math.round(profitability), fit: Math.round(fit), investmentLevel, investmentRange,
    strategy, pros, cons, risks, justification,
  };
}

export function analyzeAllCountries(company: Company): ScoredResult[] {
  return COUNTRIES.map(c => scoreCountry(company, c)).sort((a, b) => b.score - a.score);
}

export interface CompanyLookupInput {
  name?: string;
  foundedYear?: string;
  krs?: string;
}

// AI "company lookup": deterministically infer a full profile from just the name (+ optional year/KRS).
// Simulates fetching public company data so the analysis can run from minimal input.
export function inferCompanyProfile(input: CompanyLookupInput): Company {
  const name = (input.name || '').trim() || 'Nowa firma';
  const seed = seedFrom(name.toLowerCase());
  const seed2 = seedFrom(name.toLowerCase() + 'x');
  const pick = <T,>(arr: T[], sd: number): T => arr[Math.floor(sd * arr.length) % arr.length];

  const lname = name.toLowerCase();
  const kw = [
    { re: /(soft|tech|code|digital|app|data|cloud|ai|it|system|cyber|dev)/, ind: 'Technologie / IT / SaaS', prod: 'Oprogramowanie i rozwiązania cyfrowe dla przedsiębiorstw', cust: 'b2b' },
    { re: /(food|foods|coffee|drink|napoj|żywno|zywno|bio|organic|nutri|meat|dairy)/, ind: 'Żywność i napoje', prod: 'Produkty spożywcze i napoje dla rynku detalicznego', cust: 'b2b i b2c' },
    { re: /(furni|meble|wood|home|decor|design|interior|wnętrz)/, ind: 'Moda i dobra konsumenckie', prod: 'Meble i wyposażenie wnętrz klasy premium', cust: 'b2c' },
    { re: /(auto|motor|car|drive|parts|mech)/, ind: 'Motoryzacja', prod: 'Komponenty i podzespoły motoryzacyjne', cust: 'b2b' },
    { re: /(pharma|med|health|bio|care|clinic|zdrow)/, ind: 'Zdrowie i farmacja', prod: 'Produkty ochrony zdrowia i wyroby medyczne', cust: 'b2b i b2c' },
    { re: /(logi|trans|cargo|freight|ship|spedy)/, ind: 'Logistyka i transport', prod: 'Usługi logistyczne i transportowe', cust: 'b2b' },
    { re: /(energy|solar|power|energ|eco|green|wind)/, ind: 'Energetyka', prod: 'Rozwiązania z zakresu energii i efektywności energetycznej', cust: 'b2b' },
    { re: /(build|construct|budow|steel|beton|materia)/, ind: 'Budownictwo i materiały', prod: 'Materiały budowlane i rozwiązania konstrukcyjne', cust: 'b2b' },
    { re: /(shop|store|retail|market|handel|sklep|trade)/, ind: 'Handel detaliczny', prod: 'Sprzedaż detaliczna produktów konsumenckich', cust: 'b2c' },
    { re: /(fashion|wear|moda|cloth|odzież|odziez|style)/, ind: 'Moda i dobra konsumenckie', prod: 'Odzież i akcesoria modowe', cust: 'b2c' },
  ];
  const match = kw.find((k) => k.re.test(lname));
  const industry = match ? match.ind : pick(INDUSTRIES.slice(0, INDUSTRIES.length - 1), seed);
  const products = match ? match.prod : 'Produkty i usługi dla klientów biznesowych i indywidualnych';
  const customerType = match ? match.cust : pick(['b2b', 'b2c', 'b2b i b2c'], seed2);

  const employeesBuckets = ['18', '34', '52', '85', '120', '210', '340'];
  const employees = employeesBuckets[Math.floor(seed * employeesBuckets.length)];
  const empN = parseInt(employees, 10);
  const revenue = (empN * (280 + Math.floor(seed2 * 420))).toLocaleString('pl-PL').replace(/ /g, ' ') + ' 000';
  const budget = String(Math.round((80000 + seed * 900000) / 10000) * 10000);
  const foundedYear = input.foundedYear || String(2004 + Math.floor(seed2 * 18));

  const riskLevel = pick(['niski', 'sredni', 'wysoki'], seed);
  const goal = pick(GOALS.slice(0, GOALS.length - 1), seed2);
  const allRegions = REGIONS.map((r) => r.id);
  const regions = [pick(allRegions, seed), pick(allRegions.filter((_, i) => i !== Math.floor(seed * allRegions.length)), seed2)]
    .filter((v, i, a) => a.indexOf(v) === i);

  return {
    name, industry, country: 'Polska', foundedYear, employees,
    products, customerType, annualRevenue: revenue, expansionBudget: budget,
    regions: regions.length ? regions : ['europe'], riskLevel, goal,
    krs: input.krs || '', aiSourced: true,
  };
}

export function computeCompanyScore(company: Company, results: ScoredResult[]): number {
  const avg = results.reduce((s, r) => s + r.score, 0) / results.length;
  const readiness = clamp(
    (company.name ? 10 : 0) + (company.industry ? 10 : 0) + (company.annualRevenue ? 15 : 0) +
    (company.expansionBudget ? 15 : 0) + (company.regions?.length ? 15 : 0) + (company.goal ? 10 : 0) +
    (company.employees ? 10 : 0) + (company.products ? 15 : 0), 0, 100
  );
  return Math.round(avg * 0.6 + readiness * 0.4);
}

export function generateSWOT(company: Company, results: ScoredResult[]): Swot {
  const top = results.slice(0, 3);
  return {
    strengths: [
      { title: 'Zdefiniowany model biznesowy i oferta', priority: 'Wysoki', desc: `Jasno określone ${company.customerType === 'b2b' ? 'relacje B2B' : company.customerType === 'b2c' ? 'kanały B2C' : 'kanały B2B i B2C'} oraz produkty (${company.products || 'oferta firmy'}) ułatwiają adaptację komunikatu na nowych rynkach.`, justification: 'Firmy z jasno zdefiniowaną propozycją wartości osiągają wyższą skuteczność wejścia na nowe rynki.', actions: 'Przygotuj lokalne wersje materiałów sprzedażowych i dostosuj pozycjonowanie do wybranego segmentu klientów.' },
      { title: 'Doświadczenie na rynku macierzystym', priority: 'Średni', desc: `Firma działa od ${company.foundedYear || 'kilku lat'} — zbudowane kompetencje operacyjne można przenieść na rynki zagraniczne o podobnym profilu.`, justification: 'Ugruntowana pozycja lokalna zwiększa wiarygodność w oczach zagranicznych partnerów.', actions: 'Wykorzystaj referencje i case studies z rynku macierzystego w materiałach dla dystrybutorów.' },
      { title: 'Budżet dedykowany ekspansji', priority: 'Wysoki', desc: 'Zadeklarowany budżet na ekspansję pozwala sfinansować pierwszy etap wejścia bez nadmiernego obciążania bieżącej działalności.', justification: 'Dedykowany budżet koreluje z wyższym wskaźnikiem sukcesu ekspansji w pierwszych 24 miesiącach.', actions: 'Zarezerwuj 20–30% budżetu na testy rynkowe (pilotaż) przed pełnym wdrożeniem.' },
    ],
    weaknesses: [
      { title: 'Brak lokalnej obecności i sieci kontaktów', priority: 'Wysoki', desc: 'Firma nie posiada obecnie partnerów ani przedstawicielstwa na rynkach docelowych.', justification: 'Brak lokalnej sieci wydłuża czas pozyskania pierwszych klientów o 30–50%.', actions: 'Rozpocznij budowę sieci kontaktów poprzez targi branżowe i izby handlowe.' },
      { title: 'Ograniczone zasoby zespołu międzynarodowego', priority: 'Średni', desc: `Zespół liczący ${company.employees || 'kilkanaście osób'} może wymagać wsparcia w obszarze compliance i lokalizacji sprzedaży.`, justification: 'Ekspansja zagraniczna wymaga dodatkowych kompetencji językowych i prawnych.', actions: 'Rozważ zatrudnienie lokalnego konsultanta lub agencji wspierającej wejście na rynek.' },
      { title: 'Niska rozpoznawalność marki za granicą', priority: 'Średni', desc: 'Marka nie jest jeszcze znana poza rynkiem macierzystym, co wydłuża cykl sprzedaży.', justification: 'Rozpoznawalność marki bezpośrednio wpływa na koszt pozyskania klienta (CAC).', actions: 'Zaplanuj kampanię wizerunkową i lokalne partnerstwa PR przed startem sprzedaży.' },
    ],
    opportunities: top.map((r, i) => ({
      title: `Ekspansja na rynek: ${r.country.name}`, priority: i === 0 ? 'Wysoki' : 'Średni',
      desc: `Wysoki wynik dopasowania (${r.score}/100) wynikający z ${r.marketPotential > 60 ? 'dużego potencjału rynkowego' : 'stabilnych warunków makroekonomicznych'} i wzrostu PKB na poziomie ${r.country.growth}%.`,
      justification: r.justification,
      actions: `Zaplanuj wejście strategią: „${r.strategy}”.`,
    })),
    threats: [
      { title: 'Zmienność kursów walutowych', priority: 'Średni', desc: 'Ekspansja zagraniczna zwiększa ekspozycję na ryzyko kursowe, wpływające na marże i wyceny.', justification: 'Wahania kursowe rzędu kilku–kilkunastu procent rocznie są typowe dla rynków rozwijających się.', actions: 'Rozważ zabezpieczenia walutowe (hedging) lub fakturowanie w walucie lokalnej.' },
      { title: 'Rosnąca konkurencja globalna', priority: 'Wysoki', desc: 'Wybrane rynki przyciągają również innych zagranicznych graczy poszukujących wzrostu.', justification: 'Rynki o wysokim wzroście PKB odnotowują zwykle szybszy napływ nowych konkurentów.', actions: 'Zbuduj przewagę czasową — zaplanuj wejście w ciągu najbliższych 6–12 miesięcy.' },
      { title: 'Zmiany regulacyjne i celne', priority: 'Średni', desc: 'Niektóre z analizowanych rynków mogą wprowadzać zmiany w przepisach celnych i handlowych.', justification: 'Polityka handlowa państw analizowanych jest zmienna w horyzoncie 1-2 lat.', actions: 'Monitoruj zmiany regulacyjne i skonsultuj się z doradcą ds. handlu zagranicznego przed wejściem.' },
    ],
  };
}

export const DEFAULT_PROFILES: Profile[] = [
  {
    id: 'p1', name: 'Nordic Furniture Co.', avatarColor: '#1E3A5F', lastActive: '2 dni temu', hasAnalysis: true,
    company: {
      name: 'Nordic Furniture Co.', industry: 'Moda i dobra konsumenckie', country: 'Polska', foundedYear: '2014',
      employees: '45', products: 'Meble skandynawskie i dodatki wnętrzarskie klasy premium', customerType: 'b2c',
      annualRevenue: '18 000 000', expansionBudget: '600000', regions: ['europe', 'namerica'], riskLevel: 'sredni', goal: 'Zwiększenie sprzedaży',
    },
  },
  {
    id: 'p2', name: 'BrightCode Software', avatarColor: '#22C55E', lastActive: '5 dni temu', hasAnalysis: true,
    company: {
      name: 'BrightCode Software', industry: 'Technologie / IT / SaaS', country: 'Polska', foundedYear: '2019',
      employees: '22', products: 'Platforma SaaS do zarządzania łańcuchem dostaw', customerType: 'b2b',
      annualRevenue: '6 500 000', expansionBudget: '250000', regions: ['europe', 'asia'], riskLevel: 'wysoki', goal: 'Pozyskanie nowych klientów',
    },
  },
  {
    id: 'p3', name: 'GreenLeaf Foods', avatarColor: '#FBBF24', lastActive: '2 tygodnie temu', hasAnalysis: true,
    company: {
      name: 'GreenLeaf Foods', industry: 'Żywność i napoje', country: 'Polska', foundedYear: '2009',
      employees: '110', products: 'Roślinne zamienniki mięsa i przekąski proteinowe', customerType: 'b2b i b2c',
      annualRevenue: '42 000 000', expansionBudget: '1200000', regions: ['europe', 'oceania'], riskLevel: 'niski', goal: 'Znalezienie dystrybutorów',
    },
  },
];
