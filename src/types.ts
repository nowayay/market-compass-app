export interface Country {
  id: string;
  flag: string;
  iso3: string;
  name: string;
  continent: string;
  x: number;
  y: number;
  gdp: number;
  gdpPc: number;
  inflation: number;
  tax: number;
  stability: number;
  corruption: number;
  digital: number;
  internet: number;
  unemployment: number;
  growth: number;
  marketSize: number;
  competition: number;
  laborCost: number;
  tariff: number;
  infra: number;
  trade: string;
}

export interface Company {
  name: string;
  industry: string;
  country: string;
  foundedYear: string;
  employees: string;
  products: string;
  customerType: string;
  annualRevenue: string;
  expansionBudget: string;
  regions: string[];
  riskLevel: string;
  goal: string;
  krs?: string;
  aiSourced?: boolean;
}

export interface Profile {
  id: string;
  name: string;
  avatarColor: string;
  lastActive: string;
  hasAnalysis: boolean;
  company: Company | null;
}

export type Band = "recommended" | "medium" | "avoid";

export interface ScoredResult {
  country: Country;
  score: number;
  band: Band;
  risk: string;
  marketPotential: number;
  profitability: number;
  fit: number;
  investmentLevel: string;
  investmentRange: string;
  strategy: string;
  pros: string[];
  cons: string[];
  risks: string[];
  justification: string;
}

export interface SwotItem {
  title: string;
  priority: string;
  desc: string;
  justification: string;
  actions: string;
}

export interface Swot {
  strengths: SwotItem[];
  weaknesses: SwotItem[];
  opportunities: SwotItem[];
  threats: SwotItem[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface WorldFeature {
  iso3: string;
  d: string;
}

export interface MapFeature {
  iso3: string;
  d: string;
  fill: string;
  cursor: string;
  onClick?: () => void;
}

export interface DecoratedResult {
  id: string;
  name: string;
  country: Country;
  score: number;
  band: Band;
  risk: string;
  marketPotential: number;
  profitability: number;
  fit: number;
  investmentLevel: string;
  investmentRange: string;
  strategy: string;
  pros: string[];
  cons: string[];
  risks: string[];
  justification: string;
  tierLabel: string;
  tierColor: string;
  tierBg: string;
  mapFill: string;
  riskShort: string;
  riskBg: string;
  riskColor: string;
  stars: { ch: string; col: string }[];
  dots: { ch: string; col: string }[];
  markerSize: number;
  ringGradient: string;
  onOpen: () => void;
}

export interface SwotCat {
  key: string;
  letter: string;
  label: string;
  color: string;
  bullets: string[];
  priority: string;
  prioBg: string;
  prioColor: string;
  actions: string;
}

export type Screen = "profiles" | "form" | "analyzing" | "dashboard";

export interface AppState {
  screen: Screen;
  profiles: Profile[];
  activeProfileId: string | null;
  company: Company;
  results: ScoredResult[];
  swot: Swot | null;
  companyScore: number;
  selectedCountryId: string | null;
  newProfileOpen: boolean;
  newProfileName: string;
  renamingId: string | null;
  renameValue: string;
  menuOpenId: string | null;
  deleteConfirmId: string | null;
  nameMissing: boolean;
  analyzeStep: number;
  showAllRanking: boolean;
  mapZoom: number;
  mapFull: boolean;
  mapReady: boolean;
  worldFeatures: WorldFeature[];
  profileMenuOpen: boolean;
  chatOpen: boolean;
  chatMessages: ChatMessage[];
  chatInput: string;
}
