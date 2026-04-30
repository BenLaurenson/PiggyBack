import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { MerchantRulesAdminClient } from "./merchant-rules-admin-client";

export const dynamic = "force-dynamic";

export default async function MerchantRulesAdminPage() {
  // Pre-load category options for the inline edit dropdowns server-side.
  const admin = createServiceRoleClient();
  const { data: categories } = await admin
    .from("categories")
    .select("id, name, parent_category_id")
    .order("name");

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-[family-name:var(--font-nunito)] font-extrabold mb-1">
            Merchant Default Rules
          </h1>
          <p className="text-sm text-muted-foreground font-[family-name:var(--font-dm-sans)]">
            Curate the global merchant -&gt; category default mappings used during sync.
          </p>
        </header>

        <MerchantRulesAdminClient categories={categories || []} />
      </div>
    </div>
  );
}
