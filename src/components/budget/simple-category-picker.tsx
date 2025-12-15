"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Search, X, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface SimpleCategoryPickerProps {
  transactionId: string;
  currentCategoryId: string | null;
  currentParentId: string | null;
  merchantDescription: string;
  onCategoryChange: (categoryId: string | null, parentId: string | null, applyToMerchant: boolean) => Promise<void>;
  onCancel: () => void;
  open: boolean;
}

interface CategoryMapping {
  up_category_id: string;
  new_parent_name: string;
  new_child_name: string;
  icon: string;
}

interface PendingCategory {
  categoryId: string;
  displayName: string;
  icon: string;
}

export function SimpleCategoryPicker({
  transactionId,
  currentCategoryId,
  currentParentId,
  merchantDescription,
  onCategoryChange,
  onCancel,
  open,
}: SimpleCategoryPickerProps) {
  const [categories, setCategories] = useState<CategoryMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"single" | "merchant" | "remove" | false>(false);
  const [search, setSearch] = useState("");
  const [pendingCategory, setPendingCategory] = useState<PendingCategory | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && categories.length === 0) {
      loadCategories();
    }
  }, [open]);

  // Reset state when drawer closes
  useEffect(() => {
    if (!open) {
      setPendingCategory(null);
      setSearch("");
    }
  }, [open]);

  const loadCategories = async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("category_mappings")
        .select("*")
        .order("new_parent_name")
        .order("new_child_name");

      setCategories(data || []);
    } catch (error) {
      console.error("Failed to load categories:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryClick = (cat: CategoryMapping) => {
    if (cat.up_category_id === currentCategoryId) return;
    setPendingCategory({
      categoryId: cat.up_category_id,
      displayName: cat.new_child_name,
      icon: cat.icon,
    });
  };

  const handleConfirm = async (applyToMerchant: boolean) => {
    if (!pendingCategory) return;
    setSaving(applyToMerchant ? "merchant" : "single");
    try {
      await onCategoryChange(pendingCategory.categoryId, null, applyToMerchant);
    } catch (error) {
      console.error("Failed to change category:", error);
    } finally {
      setSaving(false);
      setPendingCategory(null);
    }
  };

  const handleRemoveCategory = async () => {
    setSaving("remove");
    try {
      await onCategoryChange(null, null, false);
    } catch (error) {
      console.error("Failed to remove category:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onCancel();
    }
  };

  // Group by parent
  const grouped = categories.reduce((acc, cat) => {
    if (!acc[cat.new_parent_name]) {
      acc[cat.new_parent_name] = [];
    }
    acc[cat.new_parent_name].push(cat);
    return acc;
  }, {} as Record<string, CategoryMapping[]>);

  // Filter by search
  const filteredGroups = Object.entries(grouped).filter(([parentName, cats]) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      parentName.toLowerCase().includes(searchLower) ||
      cats.some(c => c.new_child_name.toLowerCase().includes(searchLower))
    );
  });

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="max-h-[85vh] focus:outline-none">
        {/* Drag handle */}
        <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full mt-2 mb-1" style={{ backgroundColor: 'var(--border)' }} />

        <div className="px-4 sm:px-5 pb-5">
          {/* Header */}
          <div className="flex items-center justify-between py-3">
            <DrawerTitle
              className="font-[family-name:var(--font-nunito)] font-extrabold text-lg"
              style={{ color: 'var(--text-primary)' }}
            >
              Change Category
            </DrawerTitle>
            <button
              onClick={onCancel}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={{ backgroundColor: 'var(--surface-secondary)' }}
            >
              <X className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
            </button>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-12 text-center"
              >
                <div
                  className="w-10 h-10 rounded-full mx-auto mb-3 animate-pulse"
                  style={{ backgroundColor: 'var(--pastel-blue-light)' }}
                />
                <p className="font-[family-name:var(--font-dm-sans)] text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  Loading categories...
                </p>
              </motion.div>
            ) : pendingCategory ? (
              /* ── Confirmation State ── */
              <motion.div
                key="confirm"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {/* Selected category display */}
                <div
                  className="rounded-2xl p-6 text-center mb-4"
                  style={{ backgroundColor: 'var(--pastel-mint-light)' }}
                >
                  <motion.span
                    initial={{ scale: 0.5 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    className="text-5xl block mb-3"
                  >
                    {pendingCategory.icon}
                  </motion.span>
                  <p
                    className="font-[family-name:var(--font-nunito)] font-bold text-lg"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {pendingCategory.displayName}
                  </p>
                </div>

                {/* Action buttons */}
                <div className="space-y-2.5">
                  <Button
                    onClick={() => handleConfirm(false)}
                    disabled={!!saving}
                    size="lg"
                    className="w-full font-[family-name:var(--font-nunito)] font-bold text-[15px] h-12 rounded-xl"
                    style={{ backgroundColor: 'var(--pastel-blue)', color: 'white' }}
                  >
                    {saving === "single" ? "Saving…" : "This transaction only"}
                  </Button>

                  <Button
                    onClick={() => handleConfirm(true)}
                    disabled={!!saving}
                    size="lg"
                    variant="outline"
                    className="w-full font-[family-name:var(--font-nunito)] font-bold text-[15px] h-12 rounded-xl"
                    style={{ borderColor: 'var(--pastel-mint)', color: 'var(--pastel-mint-dark)' }}
                  >
                    {saving === "merchant" ? "Saving…" : `All "${merchantDescription}" transactions`}
                  </Button>

                  <button
                    onClick={() => setPendingCategory(null)}
                    disabled={!!saving}
                    className="w-full py-2.5 text-sm font-[family-name:var(--font-dm-sans)] flex items-center justify-center gap-1.5 transition-colors"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to categories
                  </button>
                </div>
              </motion.div>
            ) : (
              /* ── Browse State ── */
              <motion.div
                key="browse"
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {/* Search */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                  <Input
                    ref={searchInputRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search categories…"
                    className="pl-9 h-11 rounded-xl font-[family-name:var(--font-dm-sans)]"
                    style={{ backgroundColor: 'var(--surface-secondary)', border: '1px solid var(--border)' }}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                    >
                      <X className="h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />
                    </button>
                  )}
                </div>

                {/* Scrollable category list */}
                <div className="overflow-y-auto -mx-1 px-1" style={{ maxHeight: 'calc(85vh - 200px)' }}>
                  <div className="space-y-3 pb-2">
                    {filteredGroups.map(([parentName, cats]) => (
                      <div key={parentName}>
                        <p
                          className="font-[family-name:var(--font-nunito)] text-[11px] font-bold uppercase tracking-wider mb-1 px-2"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          {parentName}
                        </p>
                        <div className="space-y-0.5">
                          {cats.map((cat) => {
                            const isCurrent = cat.up_category_id === currentCategoryId;

                            return (
                              <button
                                key={cat.up_category_id}
                                onClick={() => handleCategoryClick(cat)}
                                disabled={!!saving || isCurrent}
                                className="w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-3 active:scale-[0.98]"
                                style={{
                                  backgroundColor: isCurrent ? 'var(--pastel-blue-light)' : 'transparent',
                                  color: isCurrent ? 'var(--pastel-blue-dark)' : 'var(--text-primary)',
                                  opacity: isCurrent ? 0.7 : 1,
                                }}
                              >
                                <span className="text-xl flex-shrink-0">{cat.icon}</span>
                                <span className="text-sm font-[family-name:var(--font-dm-sans)] font-medium">
                                  {cat.new_child_name}
                                </span>
                                {isCurrent && (
                                  <span
                                    className="ml-auto text-[11px] font-[family-name:var(--font-nunito)] font-bold px-2 py-0.5 rounded-full"
                                    style={{ backgroundColor: 'var(--pastel-blue)', color: 'white' }}
                                  >
                                    Current
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {filteredGroups.length === 0 && (
                      <div className="py-8 text-center">
                        <p className="text-sm font-[family-name:var(--font-dm-sans)]" style={{ color: 'var(--text-tertiary)' }}>
                          No categories match &ldquo;{search}&rdquo;
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Remove Category — pinned at bottom */}
                {currentCategoryId !== null && (
                  <div className="pt-3 mt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                    <Button
                      size="lg"
                      onClick={handleRemoveCategory}
                      disabled={!!saving}
                      className="w-full h-11 rounded-xl font-[family-name:var(--font-nunito)] font-bold"
                      variant="outline"
                      style={{
                        borderColor: 'var(--pastel-coral-light)',
                        color: 'var(--pastel-coral-dark)',
                      }}
                    >
                      <X className="h-4 w-4 mr-2" />
                      {saving === "remove" ? "Removing…" : "Remove Category"}
                    </Button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
