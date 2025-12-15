/**
 * Tests for methodology-section-generator.ts
 *
 * Validates that all subcategory references in templates, essential lists,
 * and always-hidden lists match actual database category mappings.
 */
import { describe, it, expect } from 'vitest';
import {
  BUILT_IN_TEMPLATES,
  ALWAYS_HIDDEN_SUBCATEGORIES,
  getTemplateConfig,
  getAvailableTemplates,
  generateSectionsFromTemplate,
  getDefaultHiddenItemIds,
  getAlwaysHiddenItemIds,
} from '../methodology-section-generator';
import { generateItemId } from '../layout-persistence';
import type { CategoryMapping } from '@/contexts/category-context';

// ------------------------------------------------------------------
// Canonical category mappings – mirrors the 44 rows in Supabase
// If a migration adds/removes mappings, update this list AND the
// template references so the tests stay in sync.
// ------------------------------------------------------------------
const CANONICAL_MAPPINGS: CategoryMapping[] = [
  // Food & Dining
  { upCategoryId: 'groceries', newParentName: 'Food & Dining', newChildName: 'Groceries', icon: '🛒', displayOrder: 1000 },
  { upCategoryId: 'restaurants-and-cafes', newParentName: 'Food & Dining', newChildName: 'Restaurants & Cafes', icon: '🍽️', displayOrder: 1001 },
  { upCategoryId: 'takeaway', newParentName: 'Food & Dining', newChildName: 'Takeaway', icon: '🍔', displayOrder: 1002 },
  { upCategoryId: 'booze', newParentName: 'Food & Dining', newChildName: 'Booze', icon: '🍺', displayOrder: 1003 },
  // Housing & Utilities
  { upCategoryId: 'rent-and-mortgage', newParentName: 'Housing & Utilities', newChildName: 'Rent & Mortgage', icon: '🏡', displayOrder: 2000 },
  { upCategoryId: 'utilities', newParentName: 'Housing & Utilities', newChildName: 'Utilities', icon: '💡', displayOrder: 2001 },
  { upCategoryId: 'internet', newParentName: 'Housing & Utilities', newChildName: 'Internet', icon: '📶', displayOrder: 2002 },
  { upCategoryId: 'homeware-and-appliances', newParentName: 'Housing & Utilities', newChildName: 'Homeware & Appliances', icon: '🏠', displayOrder: 2003 },
  { upCategoryId: 'home-maintenance-and-improvements', newParentName: 'Housing & Utilities', newChildName: 'Maintenance & Improvements', icon: '🔧', displayOrder: 2004 },
  { upCategoryId: 'home-insurance-and-rates', newParentName: 'Housing & Utilities', newChildName: 'Rates & Insurance', icon: '🛡️', displayOrder: 2005 },
  // Transportation
  { upCategoryId: 'fuel', newParentName: 'Transportation', newChildName: 'Fuel', icon: '⛽', displayOrder: 3000 },
  { upCategoryId: 'parking', newParentName: 'Transportation', newChildName: 'Parking', icon: '🅿️', displayOrder: 3001 },
  { upCategoryId: 'public-transport', newParentName: 'Transportation', newChildName: 'Public Transport', icon: '🚆', displayOrder: 3002 },
  { upCategoryId: 'taxis-and-share-cars', newParentName: 'Transportation', newChildName: 'Taxis & Share Cars', icon: '🚗', displayOrder: 3003 },
  { upCategoryId: 'car-insurance-and-maintenance', newParentName: 'Transportation', newChildName: 'Car Insurance, Rego & Maintenance', icon: '🚙', displayOrder: 3004 },
  { upCategoryId: 'toll-roads', newParentName: 'Transportation', newChildName: 'Tolls', icon: '🛣️', displayOrder: 3005 },
  { upCategoryId: 'cycling', newParentName: 'Transportation', newChildName: 'Cycling', icon: '🚴', displayOrder: 3006 },
  { upCategoryId: 'car-repayments', newParentName: 'Transportation', newChildName: 'Vehicle Repayments', icon: '🚗', displayOrder: 3007 },
  // Entertainment & Leisure
  { upCategoryId: 'tv-and-music', newParentName: 'Entertainment & Leisure', newChildName: 'TV, Music & Streaming', icon: '📺', displayOrder: 4000 },
  { upCategoryId: 'events-and-gigs', newParentName: 'Entertainment & Leisure', newChildName: 'Events & Gigs', icon: '🎵', displayOrder: 4001 },
  { upCategoryId: 'hobbies', newParentName: 'Entertainment & Leisure', newChildName: 'Hobbies', icon: '🎨', displayOrder: 4002 },
  { upCategoryId: 'holidays-and-travel', newParentName: 'Entertainment & Leisure', newChildName: 'Holidays & Travel', icon: '✈️', displayOrder: 4003 },
  { upCategoryId: 'pubs-and-bars', newParentName: 'Entertainment & Leisure', newChildName: 'Pubs & Bars', icon: '🍻', displayOrder: 4004 },
  { upCategoryId: 'lottery-and-gambling', newParentName: 'Entertainment & Leisure', newChildName: 'Lottery & Gambling', icon: '🎰', displayOrder: 4005 },
  { upCategoryId: 'adult', newParentName: 'Entertainment & Leisure', newChildName: 'Adult', icon: '🔞', displayOrder: 4006 },
  { upCategoryId: 'tobacco-and-vaping', newParentName: 'Entertainment & Leisure', newChildName: 'Tobacco & Vaping', icon: '🚬', displayOrder: 4007 },
  { upCategoryId: 'news-magazines-and-books', newParentName: 'Entertainment & Leisure', newChildName: 'News, Magazines & Books', icon: '📚', displayOrder: 4008 },
  { upCategoryId: 'games-and-software', newParentName: 'Entertainment & Leisure', newChildName: 'Apps, Games & Software', icon: '🎮', displayOrder: 4009 },
  // Personal Care & Health
  { upCategoryId: 'health-and-medical', newParentName: 'Personal Care & Health', newChildName: 'Health & Medical', icon: '💊', displayOrder: 5000 },
  { upCategoryId: 'fitness-and-wellbeing', newParentName: 'Personal Care & Health', newChildName: 'Fitness & Wellbeing', icon: '🏋️', displayOrder: 5001 },
  { upCategoryId: 'hair-and-beauty', newParentName: 'Personal Care & Health', newChildName: 'Hair & Beauty', icon: '💄', displayOrder: 5002 },
  { upCategoryId: 'clothing-and-accessories', newParentName: 'Personal Care & Health', newChildName: 'Clothing & Accessories', icon: '👕', displayOrder: 5003 },
  // Technology & Communication
  { upCategoryId: 'mobile-phone', newParentName: 'Technology & Communication', newChildName: 'Mobile Phone', icon: '📞', displayOrder: 6000 },
  { upCategoryId: 'technology', newParentName: 'Technology & Communication', newChildName: 'Technology', icon: '📱', displayOrder: 6001 },
  // Family & Education
  { upCategoryId: 'family', newParentName: 'Family & Education', newChildName: 'Children & Family', icon: '👨‍👩‍👧‍👦', displayOrder: 7000 },
  { upCategoryId: 'education-and-student-loans', newParentName: 'Family & Education', newChildName: 'Education & Student Loans', icon: '🎓', displayOrder: 7001 },
  // Financial & Admin
  { upCategoryId: 'investments', newParentName: 'Financial & Admin', newChildName: 'Investments', icon: '📈', displayOrder: 8000 },
  { upCategoryId: 'life-admin', newParentName: 'Financial & Admin', newChildName: 'Life Admin', icon: '📋', displayOrder: 8001 },
  { upCategoryId: 'external-transfer', newParentName: 'Financial & Admin', newChildName: 'External Transfers', icon: '💸', displayOrder: 8002 },
  { upCategoryId: 'salary-income', newParentName: 'Financial & Admin', newChildName: 'Salary & Income', icon: '💰', displayOrder: 8003 },
  { upCategoryId: 'interest', newParentName: 'Financial & Admin', newChildName: 'Interest Earned', icon: '🏦', displayOrder: 8004 },
  { upCategoryId: 'internal-transfer', newParentName: 'Financial & Admin', newChildName: 'Internal Transfers', icon: '🔄', displayOrder: 8005 },
  { upCategoryId: 'round-up', newParentName: 'Financial & Admin', newChildName: 'Round Up Savings', icon: '🪙', displayOrder: 8006 },
  // Pets
  { upCategoryId: 'pets', newParentName: 'Pets', newChildName: 'Pets', icon: '🐾', displayOrder: 9000 },
  // Gifts & Charity
  { upCategoryId: 'gifts-and-charity', newParentName: 'Gifts & Charity', newChildName: 'Gifts & Charity', icon: '🎁', displayOrder: 10000 },
];

// Helper: set of "parent::child" keys for quick lookup
const VALID_SUBCATEGORY_KEYS = new Set(
  CANONICAL_MAPPINGS.map(m => `${m.newParentName}::${m.newChildName}`)
);

// =====================================================
// 1. Template subcategory references match DB mappings
// =====================================================
describe('Template subcategory references', () => {
  for (const template of BUILT_IN_TEMPLATES) {
    describe(`${template.name} template`, () => {
      for (const section of template.sections) {
        describe(`"${section.name}" section`, () => {
          for (const sub of section.subcategories) {
            it(`"${sub.parent} :: ${sub.child}" exists in category mappings`, () => {
              const key = `${sub.parent}::${sub.child}`;
              expect(VALID_SUBCATEGORY_KEYS.has(key)).toBe(true);
            });
          }
        });
      }

      it('has no duplicate subcategory references within the template', () => {
        const allRefs = template.sections.flatMap(s =>
          s.subcategories.map(sub => `${sub.parent}::${sub.child}`)
        );
        const uniqueRefs = new Set(allRefs);
        const duplicates = allRefs.filter((ref, i) => allRefs.indexOf(ref) !== i);
        expect(duplicates).toEqual([]);
        expect(allRefs.length).toBe(uniqueRefs.size);
      });
    });
  }
});

// =====================================================
// 2. ALWAYS_HIDDEN_SUBCATEGORIES match DB mappings
// =====================================================
describe('ALWAYS_HIDDEN_SUBCATEGORIES', () => {
  for (const sub of ALWAYS_HIDDEN_SUBCATEGORIES) {
    it(`"${sub.parent} :: ${sub.child}" exists in category mappings`, () => {
      const key = `${sub.parent}::${sub.child}`;
      expect(VALID_SUBCATEGORY_KEYS.has(key)).toBe(true);
    });
  }

  it('contains Internal Transfers', () => {
    expect(ALWAYS_HIDDEN_SUBCATEGORIES).toContainEqual({
      parent: 'Financial & Admin',
      child: 'Internal Transfers',
    });
  });

  it('contains Salary & Income', () => {
    expect(ALWAYS_HIDDEN_SUBCATEGORIES).toContainEqual({
      parent: 'Financial & Admin',
      child: 'Salary & Income',
    });
  });

  it('contains Interest Earned', () => {
    expect(ALWAYS_HIDDEN_SUBCATEGORIES).toContainEqual({
      parent: 'Financial & Admin',
      child: 'Interest Earned',
    });
  });

  it('contains Round Up Savings', () => {
    expect(ALWAYS_HIDDEN_SUBCATEGORIES).toContainEqual({
      parent: 'Financial & Admin',
      child: 'Round Up Savings',
    });
  });

  it('has no duplicates', () => {
    const keys = ALWAYS_HIDDEN_SUBCATEGORIES.map(s => `${s.parent}::${s.child}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// =====================================================
// 3. Essential vs Always-hidden: no conflicts
// =====================================================
describe('Essential vs Always-hidden subcategories', () => {
  // We access the ESSENTIAL_SUBCATEGORIES indirectly through getDefaultHiddenItemIds
  // which excludes essentials from the hidden set.
  // Here we verify that always-hidden items never appear in template sections that
  // represent spending (they should only be in savings/financial sections if at all).

  it('no always-hidden subcategory is in the essential set (via getDefaultHiddenItemIds)', () => {
    const defaultHiddenIds = getDefaultHiddenItemIds(CANONICAL_MAPPINGS);
    const alwaysHiddenIds = getAlwaysHiddenItemIds(CANONICAL_MAPPINGS);

    // Every always-hidden ID should appear in the default hidden set
    for (const id of alwaysHiddenIds) {
      expect(defaultHiddenIds).toContain(id);
    }
  });

  it('Investments is NOT always-hidden (it is essential)', () => {
    const alwaysHiddenIds = getAlwaysHiddenItemIds(CANONICAL_MAPPINGS);
    const investmentsId = generateItemId('subcategory', 'Investments', 'Financial & Admin');
    expect(alwaysHiddenIds).not.toContain(investmentsId);
  });

  it('Life Admin is NOT always-hidden (it is essential)', () => {
    const alwaysHiddenIds = getAlwaysHiddenItemIds(CANONICAL_MAPPINGS);
    const lifeAdminId = generateItemId('subcategory', 'Life Admin', 'Financial & Admin');
    expect(alwaysHiddenIds).not.toContain(lifeAdminId);
  });

  it('Investments is NOT in defaultHiddenItemIds (it is essential)', () => {
    const defaultHiddenIds = getDefaultHiddenItemIds(CANONICAL_MAPPINGS);
    const investmentsId = generateItemId('subcategory', 'Investments', 'Financial & Admin');
    expect(defaultHiddenIds).not.toContain(investmentsId);
  });

  it('Life Admin is NOT in defaultHiddenItemIds (it is essential)', () => {
    const defaultHiddenIds = getDefaultHiddenItemIds(CANONICAL_MAPPINGS);
    const lifeAdminId = generateItemId('subcategory', 'Life Admin', 'Financial & Admin');
    expect(defaultHiddenIds).not.toContain(lifeAdminId);
  });
});

// =====================================================
// 4. generateSectionsFromTemplate
// =====================================================
describe('generateSectionsFromTemplate', () => {
  it('generates correct number of sections for 50-30-20', () => {
    const sections = generateSectionsFromTemplate('50-30-20', CANONICAL_MAPPINGS);
    expect(sections).toHaveLength(3);
    expect(sections.map(s => s.name)).toEqual(['Needs', 'Wants', 'Savings']);
  });

  it('generates correct number of sections for pay-yourself-first', () => {
    const sections = generateSectionsFromTemplate('pay-yourself-first', CANONICAL_MAPPINGS);
    expect(sections).toHaveLength(3);
    expect(sections.map(s => s.name)).toEqual(['Savings & Investments', 'Fixed Expenses', 'Variable Expenses']);
  });

  it('generates correct number of sections for 80-20', () => {
    const sections = generateSectionsFromTemplate('80-20', CANONICAL_MAPPINGS);
    expect(sections).toHaveLength(2);
    expect(sections.map(s => s.name)).toEqual(['Savings', 'Spending']);
  });

  it('all generated item IDs follow the subcategory-parent::child format', () => {
    for (const template of BUILT_IN_TEMPLATES) {
      const sections = generateSectionsFromTemplate(template.id, CANONICAL_MAPPINGS);
      for (const section of sections) {
        for (const itemId of section.itemIds) {
          expect(itemId).toMatch(/^subcategory-.+::.+$/);
        }
      }
    }
  });

  it('filters out subcategories not in mappings', () => {
    const sparseMapping: CategoryMapping[] = [
      { upCategoryId: 'groceries', newParentName: 'Food & Dining', newChildName: 'Groceries', icon: '🛒', displayOrder: 1000 },
    ];
    const sections = generateSectionsFromTemplate('50-30-20', sparseMapping);
    // Only Groceries should appear (in Needs section)
    const allItemIds = sections.flatMap(s => s.itemIds);
    expect(allItemIds).toHaveLength(1);
    expect(allItemIds[0]).toBe(generateItemId('subcategory', 'Groceries', 'Food & Dining'));
  });

  it('returns empty array for unknown template', () => {
    const sections = generateSectionsFromTemplate('unknown' as any, CANONICAL_MAPPINGS);
    expect(sections).toEqual([]);
  });

  it('preserves percentage values on sections', () => {
    const sections = generateSectionsFromTemplate('50-30-20', CANONICAL_MAPPINGS);
    expect(sections[0].percentage).toBe(50);
    expect(sections[1].percentage).toBe(30);
    expect(sections[2].percentage).toBe(20);
  });

  it('preserves color values on sections', () => {
    const sections = generateSectionsFromTemplate('50-30-20', CANONICAL_MAPPINGS);
    expect(sections[0].color).toBe('#F87171'); // coral
    expect(sections[1].color).toBe('#FBBF24'); // yellow
    expect(sections[2].color).toBe('#34D399'); // mint
  });

  it('each section has a unique UUID id', () => {
    const sections = generateSectionsFromTemplate('50-30-20', CANONICAL_MAPPINGS);
    const ids = sections.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
  });
});

// =====================================================
// 5. getDefaultHiddenItemIds
// =====================================================
describe('getDefaultHiddenItemIds', () => {
  it('returns item IDs for non-essential + always-hidden subcategories', () => {
    const hiddenIds = getDefaultHiddenItemIds(CANONICAL_MAPPINGS);
    expect(hiddenIds.length).toBeGreaterThan(0);
  });

  it('includes all always-hidden IDs', () => {
    const defaultHidden = getDefaultHiddenItemIds(CANONICAL_MAPPINGS);
    const alwaysHidden = getAlwaysHiddenItemIds(CANONICAL_MAPPINGS);
    for (const id of alwaysHidden) {
      expect(defaultHidden).toContain(id);
    }
  });

  it('does not include essential subcategories like Groceries', () => {
    const hiddenIds = getDefaultHiddenItemIds(CANONICAL_MAPPINGS);
    const groceriesId = generateItemId('subcategory', 'Groceries', 'Food & Dining');
    expect(hiddenIds).not.toContain(groceriesId);
  });

  it('does not include essential subcategories like Rent & Mortgage', () => {
    const hiddenIds = getDefaultHiddenItemIds(CANONICAL_MAPPINGS);
    const rentId = generateItemId('subcategory', 'Rent & Mortgage', 'Housing & Utilities');
    expect(hiddenIds).not.toContain(rentId);
  });

  it('hides non-essential template items like Tolls', () => {
    const hiddenIds = getDefaultHiddenItemIds(CANONICAL_MAPPINGS);
    const tollsId = generateItemId('subcategory', 'Tolls', 'Transportation');
    expect(hiddenIds).toContain(tollsId);
  });

  it('returns empty for empty mappings', () => {
    expect(getDefaultHiddenItemIds([])).toEqual([]);
  });
});

// =====================================================
// 6. getAlwaysHiddenItemIds
// =====================================================
describe('getAlwaysHiddenItemIds', () => {
  it('returns correct IDs for all 4 always-hidden subcategories', () => {
    const ids = getAlwaysHiddenItemIds(CANONICAL_MAPPINGS);
    expect(ids).toHaveLength(4);
    expect(ids).toContain(generateItemId('subcategory', 'Internal Transfers', 'Financial & Admin'));
    expect(ids).toContain(generateItemId('subcategory', 'Salary & Income', 'Financial & Admin'));
    expect(ids).toContain(generateItemId('subcategory', 'Interest Earned', 'Financial & Admin'));
    expect(ids).toContain(generateItemId('subcategory', 'Round Up Savings', 'Financial & Admin'));
  });

  it('filters out mappings that do not exist', () => {
    const sparseMapping: CategoryMapping[] = [
      { upCategoryId: 'internal-transfer', newParentName: 'Financial & Admin', newChildName: 'Internal Transfers', icon: '🔄', displayOrder: 8005 },
    ];
    const ids = getAlwaysHiddenItemIds(sparseMapping);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBe(generateItemId('subcategory', 'Internal Transfers', 'Financial & Admin'));
  });

  it('returns empty for empty mappings', () => {
    expect(getAlwaysHiddenItemIds([])).toEqual([]);
  });
});

// =====================================================
// 7. getTemplateConfig and getAvailableTemplates
// =====================================================
describe('getTemplateConfig', () => {
  it('returns config for each valid template ID', () => {
    expect(getTemplateConfig('50-30-20')).toBeDefined();
    expect(getTemplateConfig('pay-yourself-first')).toBeDefined();
    expect(getTemplateConfig('80-20')).toBeDefined();
  });

  it('returns undefined for unknown template ID', () => {
    expect(getTemplateConfig('unknown' as any)).toBeUndefined();
  });
});

describe('getAvailableTemplates', () => {
  it('returns metadata for all 3 templates', () => {
    const templates = getAvailableTemplates();
    expect(templates).toHaveLength(3);
    for (const t of templates) {
      expect(t).toHaveProperty('id');
      expect(t).toHaveProperty('name');
      expect(t).toHaveProperty('description');
      expect(t).toHaveProperty('icon');
    }
  });
});

// =====================================================
// 8. Cross-template consistency checks
// =====================================================
describe('Cross-template consistency', () => {
  it('Round Up Savings appears in template savings sections (not spending)', () => {
    for (const template of BUILT_IN_TEMPLATES) {
      for (const section of template.sections) {
        const hasRoundUp = section.subcategories.some(
          s => s.parent === 'Financial & Admin' && s.child === 'Round Up Savings'
        );
        if (hasRoundUp) {
          // Should be in a section named like "Savings" not "Needs" or "Spending"
          expect(section.name.toLowerCase()).toMatch(/saving/i);
        }
      }
    }
  });

  it('Vehicle Repayments appears in transportation-related sections', () => {
    for (const template of BUILT_IN_TEMPLATES) {
      for (const section of template.sections) {
        const hasVehicle = section.subcategories.some(
          s => s.parent === 'Transportation' && s.child === 'Vehicle Repayments'
        );
        if (hasVehicle) {
          // Should be in Needs or a general spending section
          expect(['Needs', 'Spending']).toContain(section.name);
        }
      }
    }
  });

  it('External Transfers references match DB exactly', () => {
    for (const template of BUILT_IN_TEMPLATES) {
      for (const section of template.sections) {
        const hasExtTransfer = section.subcategories.some(
          s => s.child === 'External Transfers'
        );
        if (hasExtTransfer) {
          const sub = section.subcategories.find(s => s.child === 'External Transfers')!;
          expect(sub.parent).toBe('Financial & Admin');
        }
      }
    }
  });
});
