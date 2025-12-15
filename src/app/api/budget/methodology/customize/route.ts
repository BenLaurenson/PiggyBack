import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { METHODOLOGY_MAPPINGS } from "@/lib/methodology-mapper";

type Methodology = 'zero-based' | '50-30-20' | 'envelope' | 'pay-yourself-first' | '80-20';

interface CustomCategory {
  id: string;
  name: string;
  originalName: string;
  percentage?: number;
  underlyingCategories: string[];
  color: string;
  displayOrder: number;
  isHidden: boolean;
}

interface MethodologyCustomization {
  custom_categories: CustomCategory[];
  hidden_subcategories: string[];
}

/**
 * GET /api/budget/methodology/customize
 *
 * Fetch methodology customizations and merge with preset
 *
 * Query Params:
 * - partnership_id: string (required)
 * - methodology: string (required)
 *
 * Response:
 * {
 *   customizations: MethodologyCustomization | null,
 *   preset: MethodologyCategory[],
 *   merged: MethodologyCategory[]
 * }
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const partnershipId = searchParams.get("partnership_id");
  const methodologyParam = searchParams.get("methodology");
  const methodology = methodologyParam as Methodology;

  // Validate methodology
  if (!methodology || !['zero-based', '50-30-20', 'envelope', 'pay-yourself-first', '80-20'].includes(methodology)) {
    return NextResponse.json(
      { error: "Invalid methodology" },
      { status: 400 }
    );
  }

  if (!partnershipId || !methodology) {
    return NextResponse.json(
      { error: "Missing partnership_id or methodology" },
      { status: 400 }
    );
  }

  // Verify partnership membership
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .eq("partnership_id", partnershipId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Fetch user customization (or partnership-wide if no user-specific)
  const { data: customization } = await supabase
    .from("methodology_customizations")
    .select("*")
    .eq("partnership_id", partnershipId)
    .eq("methodology_name", methodology)
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .order("user_id", { ascending: false })  // User-specific takes precedence
    .limit(1)
    .maybeSingle();

  // Get preset methodology
  const preset = METHODOLOGY_MAPPINGS[methodology] || [];

  // Merge preset with customizations
  let merged = preset;
  if (customization && customization.custom_categories.length > 0) {
    merged = mergeCustomizations(preset, customization.custom_categories);
  }

  return NextResponse.json({
    customizations: customization ? {
      custom_categories: customization.custom_categories,
      hidden_subcategories: customization.hidden_subcategories,
    } : null,
    preset,
    merged,
  });
}

/**
 * POST /api/budget/methodology/customize
 *
 * Create or update methodology customization
 *
 * Request Body:
 * {
 *   partnership_id: string,
 *   methodology: Methodology,
 *   custom_categories: CustomCategory[],
 *   hidden_subcategories: string[],
 *   is_partnership_wide?: boolean
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   customization: {...},
 *   merged: MethodologyCategory[]
 * }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    partnership_id,
    methodology: methodologyRaw,
    custom_categories,
    hidden_subcategories,
    is_partnership_wide = false,
  } = body;

  const methodology = methodologyRaw as Methodology;

  // Validate methodology
  if (!methodology || !['zero-based', '50-30-20', 'envelope', 'pay-yourself-first', '80-20'].includes(methodology)) {
    return NextResponse.json(
      { error: "Invalid methodology" },
      { status: 400 }
    );
  }

  if (!partnership_id || !methodology) {
    return NextResponse.json(
      { error: "Missing partnership_id or methodology" },
      { status: 400 }
    );
  }

  // Verify partnership membership
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("partnership_id", partnership_id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Only owners can create partnership-wide customizations
  if (is_partnership_wide && membership.role !== 'owner') {
    return NextResponse.json(
      { error: "Only partnership owners can create partnership-wide customizations" },
      { status: 403 }
    );
  }

  // Validate customizations
  const validationError = validateCustomizations(methodology, custom_categories);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    // Upsert customization
    const { data: customization, error: upsertError } = await supabase
      .from("methodology_customizations")
      .upsert({
        partnership_id,
        user_id: is_partnership_wide ? null : user.id,
        methodology_name: methodology,
        custom_categories: custom_categories || [],
        hidden_subcategories: hidden_subcategories || [],
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'partnership_id,user_id,methodology_name'
      })
      .select()
      .single();

    if (upsertError) {
      console.error("Failed to save customization:", upsertError);
      return NextResponse.json(
        { error: "Failed to save customization" },
        { status: 500 }
      );
    }

    // Merge with preset
    const preset = METHODOLOGY_MAPPINGS[methodology] || [];
    const merged = mergeCustomizations(preset, custom_categories);

    return NextResponse.json({
      success: true,
      customization,
      merged,
    });

  } catch (error) {
    console.error("Customization save error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/budget/methodology/customize
 *
 * Reset methodology to preset (delete customizations)
 *
 * Query Params:
 * - partnership_id: string
 * - methodology: string
 */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const partnershipId = searchParams.get("partnership_id");
  const methodologyParam = searchParams.get("methodology");
  const methodology = methodologyParam as Methodology;

  // Validate
  if (!partnershipId || !methodology) {
    return NextResponse.json(
      { error: "Missing partnership_id or methodology" },
      { status: 400 }
    );
  }

  if (!['zero-based', '50-30-20', 'envelope', 'pay-yourself-first', '80-20'].includes(methodology)) {
    return NextResponse.json(
      { error: "Invalid methodology" },
      { status: 400 }
    );
  }

  try {
    // Delete user-specific customization
    const { error: deleteError } = await supabase
      .from("methodology_customizations")
      .delete()
      .eq("partnership_id", partnershipId)
      .eq("user_id", user.id)
      .eq("methodology_name", methodology);

    if (deleteError) {
      console.error("Failed to delete customization:", deleteError);
      return NextResponse.json(
        { error: "Failed to reset customization" },
        { status: 500 }
      );
    }

    // Return preset methodology
    const preset = METHODOLOGY_MAPPINGS[methodology as Methodology] || [];

    return NextResponse.json({
      success: true,
      preset,
      reset: true,
    });

  } catch (error) {
    console.error("Reset error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Validate customizations
 */
function validateCustomizations(
  methodology: Methodology,
  customCategories: CustomCategory[]
): string | null {
  if (!customCategories || customCategories.length === 0) {
    return null;  // Empty is valid (no customizations)
  }

  // For percentage-based methodologies, ensure percentages sum to 100
  const percentageMethodologies: Methodology[] = ['50-30-20', 'pay-yourself-first', '80-20'];

  if (percentageMethodologies.includes(methodology)) {
    const total = customCategories
      .filter(c => !c.isHidden && c.percentage !== undefined)
      .reduce((sum, c) => sum + (c.percentage || 0), 0);

    if (Math.abs(total - 100) > 0.01) {  // Allow 0.01% rounding error
      return `Percentages must sum to 100% (currently ${total.toFixed(1)}%)`;
    }
  }

  // Ensure category names are unique
  const names = customCategories.map(c => c.name);
  const uniqueNames = new Set(names);
  if (names.length !== uniqueNames.size) {
    return "Category names must be unique";
  }

  // Ensure underlying categories exist
  const allModernCategories = [
    'Food & Dining',
    'Housing & Utilities',
    'Transportation',
    'Entertainment & Leisure',
    'Personal Care & Health',
    'Technology & Communication',
    'Family & Education',
    'Financial & Admin',
    'Pets',
    'Gifts & Charity',
    'Miscellaneous',
  ];

  for (const cat of customCategories) {
    for (const underlying of cat.underlyingCategories) {
      if (!allModernCategories.includes(underlying)) {
        return `Invalid underlying category: "${underlying}"`;
      }
    }
  }

  return null;  // Valid
}

/**
 * Merge preset with customizations
 */
function mergeCustomizations(preset: any[], customCategories: CustomCategory[]): any[] {
  if (!customCategories || customCategories.length === 0) {
    return preset;
  }

  const merged = preset.map(presetCat => {
    // Find matching customization by originalName
    const custom = customCategories.find(
      c => c.originalName === presetCat.name
    );

    if (!custom) return presetCat;  // No customization

    // Merge preset with customization
    return {
      ...presetCat,
      name: custom.name || presetCat.name,
      percentage: custom.percentage ?? presetCat.percentage,
      upBankCategories: custom.underlyingCategories || presetCat.upBankCategories,
      color: custom.color || presetCat.color,
      displayOrder: custom.displayOrder ?? preset.indexOf(presetCat),
      isHidden: custom.isHidden || false,
      isCustomized: true,
    };
  });

  // Sort by display order
  merged.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

  // Filter hidden categories
  return merged.filter(c => !c.isHidden);
}
