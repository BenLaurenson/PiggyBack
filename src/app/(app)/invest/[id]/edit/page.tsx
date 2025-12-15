import { createClient } from "@/utils/supabase/server";
import { InvestEditClient } from "@/components/invest/invest-edit-client";
import { redirect } from "next/navigation";

export default async function InvestEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch the investment
  const { data: investment } = await supabase
    .from("investments")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!investment) {
    redirect("/invest");
  }

  // Verify ownership through partnership
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user?.id)
    .limit(1)
    .maybeSingle();

  if (investment.partnership_id !== membership?.partnership_id) {
    redirect("/invest");
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <InvestEditClient investment={investment} />
    </div>
  );
}
