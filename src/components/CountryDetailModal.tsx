"use client";

import { useEffect, useState } from "react";
import type { DecoratedCountry } from "../types";
import type { CountryDetails } from "../contracts/countryDetails";
import { fetchCountryDetails, CountryDetailsClientError } from "../lib/company-research/countryDetailsClient";
import { loadCountryDetails, saveCountryDetails } from "../lib/countryDetailsStorage";
import { useDialog } from "../lib/useDialog";
import FlagIcon from './FlagIcon';

/** The subset of dashboard company facts sent as context for a country deep-dive. */
export interface CountryModalCompany {
  legalName: string;
  krs?: string;
  industry?: string;
  description?: string;
  productsServices: string[];
  customerSegments: string[];
  operatingMarkets: string[];
}

const CONFIDENCE_META: Record<CountryDetails["confidenceLevel"], { label: string; color: string; bg: string }> = {
  low: { label: 'Niska pewność', color: '#B45309', bg: '#FEF3C7' },
  medium: { label: 'Średnia pewność', color: '#1D4ED8', bg: '#DBEAFE' },
  high: { label: 'Wysoka pewność', color: '#15803D', bg: '#DCFCE7' },
};

const GENERIC_ERROR = 'Nie udało się wygenerować szczegółów dla tego kraju. Spróbuj ponownie.';

/** Section heading matching the existing modal typography. */
function SectionLabel({ text, color = '#6B7280' }: { text: string; color?: string }) {
  return (
    <div style={{ fontSize: 11.5, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 8 }}>
      {text}
    </div>
  );
}

/** One bulleted line, styled like the existing Szanse/Ryzyka rows. */
function Bullet({ mark, markColor, text }: { mark: string; markColor: string; text: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12.5, color: '#1F2937', lineHeight: 1.5, marginBottom: 6 }}>
      <span style={{ color: markColor }}>{mark}</span>{text}
    </div>
  );
}

export default function CountryDetailModal({
  country,
  company,
  onClose,
}: {
  country: DecoratedCountry;
  company: CountryModalCompany;
  onClose: () => void;
}) {
  const stopProp = (e: React.MouseEvent) => e.stopPropagation();
  const panelRef = useDialog(onClose);

  const [details, setDetails] = useState<CountryDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped by the retry button to re-run the fetch, bypassing the cache.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const code = country.countryCode;
    let cancelled = false;
    const controller = new AbortController();

    // On the first attempt for this country, reuse a cached deep-dive if one is
    // stored (keyed by KRS + country code) — no API call on re-open.
    if (attempt === 0) {
      const cached = loadCountryDetails(company.krs, code);
      if (cached) {
        setDetails(cached);
        setError(null);
        setLoading(false);
        return () => { cancelled = true; controller.abort(); };
      }
    }

    setDetails(null);
    setError(null);
    setLoading(true);

    fetchCountryDetails(
      {
        company: {
          legalName: company.legalName,
          industry: company.industry,
          description: company.description,
          productsServices: company.productsServices,
          customerSegments: company.customerSegments,
          operatingMarkets: company.operatingMarkets,
        },
        country: { countryCode: code, countryName: country.countryName, score: country.score },
      },
      controller.signal,
    )
      .then((d) => {
        if (cancelled) return;
        saveCountryDetails(company.krs, code, d);
        setDetails(d);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled || controller.signal.aborted) return;
        setError(e instanceof CountryDetailsClientError ? e.message : GENERIC_ERROR);
        setLoading(false);
      });

    return () => { cancelled = true; controller.abort(); };
  }, [country.countryCode, country.countryName, country.score, company, attempt]);

  // The base analysis fills Szanse/Ryzyka instantly; the deep-dive upgrades
  // them in place (exactly 4 each) once it arrives — same layout either way.
  const shownOpportunities = details?.opportunities ?? country.opportunities;
  const shownRisks = details?.risks ?? country.risks;
  const confidence = details ? CONFIDENCE_META[details.confidenceLevel] : null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.5)', zIndex: 60, display: 'flex', justifyContent: 'flex-end', animation: 'mc-fade-up .18s ease' }} onClick={onClose}>
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="country-detail-title"
        onClick={stopProp}
        style={{ width: 480, maxWidth: '92vw', height: '100%', background: '#FAFBFC', boxShadow: '-16px 0 40px rgba(0,0,0,0.15)', overflowY: 'auto', padding: 28 }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: country.tierInk }}>{country.tierLabel}</div>
            <div id="country-detail-title" style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginTop: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
              <FlagIcon countryId={country.countryCode} size={28} />
              {country.countryName}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Zamknij szczegóły kraju" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', width: 32, height: 32, borderRadius: 9, cursor: 'pointer', fontSize: 15, color: '#6B7280' }}>✕</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, margin: '20px 0' }}>
          <div style={{ width: 84, height: 84, borderRadius: '50%', flexShrink: 0, background: `conic-gradient(${country.tierInk} ${country.score}%, #EBECEF 0)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#111827' }}>{country.score}</div>
              <div style={{ fontSize: 9.5, color: '#6B7280' }}>/100</div>
            </div>
          </div>
          <div style={{ fontSize: 13, color: '#1F2937', lineHeight: 1.55 }}>{country.summary}</div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <SectionLabel text="Szanse" color="#15803D" />
          {shownOpportunities.map((op, i) => (
            <Bullet key={i} mark="✓" markColor="#15803D" text={op} />
          ))}
        </div>
        <div style={{ marginBottom: 12 }}>
          <SectionLabel text="Ryzyka" color="#DC2626" />
          {shownRisks.map((rk, i) => (
            <Bullet key={i} mark="!" markColor="#DC2626" text={rk} />
          ))}
        </div>

        {/* On-demand deep-dive: loaded when the country is opened, cached after. */}
        <div style={{ borderTop: '1px solid #ECEEF1', marginTop: 18, paddingTop: 18 }}>
          {loading && (
            <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#6B7280', fontSize: 12.5, padding: '6px 0' }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #E5E7EB', borderTopColor: '#16A34A', animation: 'mc-spin 0.9s linear infinite', display: 'inline-block' }} />
              Generuję szczegółową analizę rynku…
            </div>
          )}

          {!loading && error && (
            <div role="alert" style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 12.5, color: '#B91C1C', lineHeight: 1.5, marginBottom: 10 }}>{error}</div>
              <button
                type="button"
                onClick={() => setAttempt((a) => a + 1)}
                style={{ background: '#16A34A', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
              >
                Spróbuj ponownie
              </button>
            </div>
          )}

          {!loading && !error && details && (
            <>
              <div style={{ marginBottom: 18 }}>
                <SectionLabel text="Uzasadnienie oceny" />
                <div style={{ fontSize: 12.5, color: '#1F2937', lineHeight: 1.55 }}>{details.scoreRationale}</div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <SectionLabel text="Segmenty klientów" />
                {details.customerSegments.map((s, i) => (
                  <Bullet key={i} mark="•" markColor="#6B7280" text={s} />
                ))}
              </div>

              <div style={{ marginBottom: 18 }}>
                <SectionLabel text="Konkurencja" />
                <div style={{ fontSize: 12.5, color: '#1F2937', lineHeight: 1.55 }}>{details.competition}</div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <SectionLabel text="Rekomendowany model wejścia" />
                <div style={{ fontSize: 12.5, color: '#1F2937', lineHeight: 1.55 }}>{details.entryModel}</div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <SectionLabel text="Bariery wejścia" color="#B45309" />
                {details.barriers.map((b, i) => (
                  <Bullet key={i} mark="▸" markColor="#B45309" text={b} />
                ))}
              </div>

              <div style={{ marginBottom: 18 }}>
                <SectionLabel text="Pierwsze kroki" color="#1D4ED8" />
                {details.firstSteps.map((s, i) => (
                  <Bullet key={i} mark={`${i + 1}.`} markColor="#2563EB" text={s} />
                ))}
              </div>

              {confidence && (
                <div style={{ marginBottom: 4 }}>
                  <SectionLabel text="Poziom pewności" />
                  <div style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 700, color: confidence.color, background: confidence.bg, borderRadius: 999, padding: '3px 10px', marginBottom: 8 }}>
                    {confidence.label}
                  </div>
                  <div style={{ fontSize: 12, color: '#4B5563', lineHeight: 1.5 }}>{details.confidenceRationale}</div>
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.5, marginTop: 16 }}>
          Analiza wygenerowana przez AI na podstawie profilu firmy. Nie stanowi porady prawnej ani podatkowej, nie zawiera wyliczonych wskaźników finansowych - traktuj ją jako punkt wyjścia do dalszej weryfikacji.
        </div>
      </div>
    </div>
  );
}
