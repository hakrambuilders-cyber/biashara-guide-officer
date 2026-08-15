/**
 * Regulatory Registry — synced from the Version B citizen engine.
 * See the citizen copy for the full governance boundary.
 */

export const REGISTRY_META = Object.freeze({
  registryVersion: '2026.08.12-1',
  verifiedAt: '2026-08-12',
  sourceStatus: 'official-source-verified',
  prototypeReview: 'Official TRA sources checked; TRA legal/content sign-off required before real deployment.'
});

export const ACTIVE_RULES = Object.freeze({
  id: 'BG-RULESET-2026-08-12',
  status: 'active',
  appliesAsOf: '2026-08-12',
  presumptiveTax: Object.freeze({
    annualTurnoverCap: 200_000_000,
    bands: Object.freeze([
      Object.freeze({ upTo: 4_000_000, incompleteRecordsTax: 0 }),
      Object.freeze({ upTo: 7_000_000, incompleteRecordsTax: 100_000 }),
      Object.freeze({ upTo: 11_000_000, incompleteRecordsTax: 250_000 }),
      Object.freeze({ upTo: 200_000_000, incompleteRecordsRate: 0.04 })
    ]),
    sourceTitle: 'TRA — Income Tax for Individuals',
    sourceUrl: 'https://www.tra.go.tz/page/income-tax-for-individuals'
  }),
  efd: Object.freeze({
    annualTurnoverThreshold: 11_000_000,
    sourceTitle: 'TRA — EFD/VFD Suppliers',
    sourceUrl: 'https://www.tra.go.tz/page/efd-vfd-suppliers'
  })
});

export const REGULATORY_REGISTER = Object.freeze([
  Object.freeze({
    id: 'BG-REG-003', title: 'Core small-business guidance ruleset verification', instrumentType: 'TRA operational guidance',
    publishedOn: null, effectiveFrom: null, verifiedOn: '2026-08-12', status: 'active',
    impact: 'Presumptive-tax cap/rates and EFD threshold used by citizen guidance were aligned to current official TRA pages.',
    affectedProfiles: ['Resident individual traders', 'Small businesses using the tax estimate', 'EFD-sensitive businesses'],
    sourceTitle: 'TRA — Income Tax for Individuals and EFD/VFD Suppliers',
    sourceUrl: 'https://www.tra.go.tz/page/income-tax-for-individuals',
    approval: 'Official-source verified in prototype; TRA legal/content sign-off pending for real deployment.'
  }),
  Object.freeze({
    id: 'BG-REG-002', title: 'VAT chargeability for international transport services', instrumentType: 'TRA public notice / ruling',
    publishedOn: '2026-08-06', effectiveFrom: '2026-08-06', verifiedOn: '2026-08-12', status: 'active-reference',
    impact: 'Recorded with its effective date. It does not change the generic informal-business tax calculator; it is relevant only to qualifying international transport and related services.',
    affectedProfiles: ['Qualifying international transport', 'Specified ancillary/transit services'],
    sourceTitle: 'TRA public notices — 6 August 2026 VAT notice', sourceUrl: 'https://www.tra.go.tz/public-notice/all',
    approval: 'Official-source verified in prototype; specialist mapping required before profile-level publication.'
  }),
  Object.freeze({
    id: 'BG-REG-001', title: 'Legacy hardcoded prototype parameters', instrumentType: 'Internal prototype configuration',
    publishedOn: null, effectiveFrom: null, verifiedOn: '2026-08-12', status: 'replaced',
    impact: 'The earlier TZS 100m presumptive cap, 3.5% upper rate and TZS 14m EFD threshold were removed from the active engine after official-source rechecking.',
    affectedProfiles: ['All calculator users'], sourceTitle: 'Replaced prototype configuration', sourceUrl: null,
    approval: 'Retained only as an internal audit-history entry; it is no longer active guidance.'
  })
]);

export function currentRules() { return ACTIVE_RULES; }

