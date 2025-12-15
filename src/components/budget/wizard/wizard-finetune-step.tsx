"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Input } from "@/components/ui/input";
import {
  GripVertical,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Target,
  TrendingUp,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import {
  ALL_PARENT_CATEGORIES,
  CATEGORY_SUBCATEGORIES,
  getSubcategoriesForParents,
  BUDGET_TEMPLATES,
} from "@/lib/budget-templates";
import { generateItemId } from "@/lib/layout-persistence";
import type { Section } from "@/lib/layout-persistence";
import type { WizardState } from "../budget-create-wizard";

interface WizardFinetuneStepProps {
  state: WizardState;
  onUpdate: (updates: Partial<WizardState>) => void;
  onNext: () => void;
  goals: { id: string; name: string }[];
  investments: { id: string; name: string }[];
}

const PERIOD_OPTIONS = [
  { value: "weekly" as const, label: "Weekly" },
  { value: "fortnightly" as const, label: "Fortnightly" },
  { value: "monthly" as const, label: "Monthly" },
];

const SECTION_COLORS = [
  "#F87171",
  "#34D399",
  "#60A5FA",
  "#FBBF24",
  "#A78BFA",
  "#F472B6",
];

/**
 * Build default sections from the selected template's section config.
 */
function buildSectionsFromTemplate(
  state: WizardState,
  goals: { id: string; name: string }[],
  investments: { id: string; name: string }[]
): Section[] {
  const template = state.template;
  if (!template) return [];

  const parentCategories =
    state.includedCategories.length > 0
      ? state.includedCategories
      : [...ALL_PARENT_CATEGORIES];

  const overrideMap = new Map<string, number>();
  template.sections.forEach((ts, i) => {
    if (ts.includeSubcategories) {
      for (const key of ts.includeSubcategories) {
        const [parent, child] = key.split("::");
        if (parent && child) {
          overrideMap.set(generateItemId("subcategory", child, parent), i);
        }
      }
    }
  });

  return template.sections.map((ts, i) => {
    const itemIds: string[] = [];

    for (const parentCat of ts.categories) {
      if (!parentCategories.includes(parentCat)) continue;
      const subs = CATEGORY_SUBCATEGORIES[parentCat] ?? [];
      for (const sub of subs) {
        const id = generateItemId("subcategory", sub, parentCat);
        const overrideTo = overrideMap.get(id);
        if (overrideTo === undefined || overrideTo === i) {
          itemIds.push(id);
        }
      }
    }

    for (const [itemId, sectionIdx] of overrideMap.entries()) {
      if (sectionIdx === i && !itemIds.includes(itemId)) {
        itemIds.push(itemId);
      }
    }

    if (ts.includeGoals && goals.length > 0) {
      for (const g of goals) {
        itemIds.push(generateItemId("goal", g.id));
      }
    }

    if (ts.includeInvestments && investments.length > 0) {
      for (const inv of investments) {
        itemIds.push(generateItemId("asset", inv.id));
      }
    }

    return {
      id: crypto.randomUUID(),
      name: ts.name,
      itemIds,
      collapsed: false,
      color: ts.color ?? SECTION_COLORS[i % SECTION_COLORS.length],
      displayOrder: i,
      percentage: ts.percentage,
    };
  });
}

function getUnsectionedItems(
  sections: Section[],
  parentCategories: string[],
  goals: { id: string; name: string }[],
  investments: { id: string; name: string }[]
): string[] {
  const allSubs = getSubcategoriesForParents(parentCategories);
  const allIds = [
    ...allSubs.map((s) => generateItemId("subcategory", s.child, s.parent)),
    ...goals.map((g) => generateItemId("goal", g.id)),
    ...investments.map((inv) => generateItemId("asset", inv.id)),
  ];
  const sectionedIds = new Set(sections.flatMap((s) => s.itemIds));
  return allIds.filter((id) => !sectionedIds.has(id));
}

function itemLabel(
  itemId: string,
  goalMap: Map<string, string>,
  investmentMap: Map<string, string>
): string {
  if (itemId.startsWith("subcategory-")) {
    const rest = itemId.slice("subcategory-".length);
    const sep = rest.indexOf("::");
    if (sep >= 0) return rest.slice(sep + 2);
    return rest;
  }
  if (itemId.startsWith("goal-")) {
    const uuid = itemId.slice("goal-".length);
    return goalMap.get(uuid) ?? "Savings Goal";
  }
  if (itemId.startsWith("asset-")) {
    const uuid = itemId.slice("asset-".length);
    return investmentMap.get(uuid) ?? "Investment";
  }
  if (itemId.startsWith("cat-")) return itemId.slice(4);
  return itemId;
}

function itemParent(itemId: string): string {
  if (itemId.startsWith("subcategory-")) {
    const rest = itemId.slice("subcategory-".length);
    const sep = rest.indexOf("::");
    if (sep >= 0) return rest.slice(0, sep);
  }
  if (itemId.startsWith("goal-")) return "Savings Goal";
  if (itemId.startsWith("asset-")) return "Investment";
  return "";
}

function ItemTypeIcon({ itemId }: { itemId: string }) {
  if (itemId.startsWith("goal-"))
    return (
      <Target
        className="w-3 h-3 shrink-0"
        style={{ color: "var(--pastel-mint-dark, #34D399)" }}
        aria-hidden="true"
      />
    );
  if (itemId.startsWith("asset-"))
    return (
      <TrendingUp
        className="w-3 h-3 shrink-0"
        style={{ color: "var(--pastel-coral-dark, #F87171)" }}
        aria-hidden="true"
      />
    );
  return null;
}

export function WizardFinetuneStep({
  state,
  onUpdate,
  onNext,
  goals,
  investments,
}: WizardFinetuneStepProps) {
  // Defer DnD rendering to avoid React 19 StrictMode double-mount errors
  const [dndEnabled, setDndEnabled] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDndEnabled(true));
    return () => {
      cancelAnimationFrame(frame);
      setDndEnabled(false);
    };
  }, []);

  // Section header editing state
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionName, setEditingSectionName] = useState("");

  // Lookup maps for goal/investment names
  const goalMap = useMemo(
    () => new Map(goals.map((g) => [g.id, g.name])),
    [goals]
  );
  const investmentMap = useMemo(
    () => new Map(investments.map((i) => [i.id, i.name])),
    [investments]
  );

  // Build sections from template when this step mounts (if template selected and sections empty)
  useEffect(() => {
    if (state.template && state.sections.length === 0) {
      const sections = buildSectionsFromTemplate(state, goals, investments);
      onUpdate({ sections });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startEditingSectionName = useCallback(
    (sectionId: string, currentName: string) => {
      setEditingSectionId(sectionId);
      setEditingSectionName(currentName);
    },
    []
  );

  const saveSectionName = useCallback(() => {
    if (editingSectionId && editingSectionName.trim()) {
      const updatedSections = state.sections.map((s) =>
        s.id === editingSectionId
          ? { ...s, name: editingSectionName.trim() }
          : s
      );
      onUpdate({ sections: updatedSections });
    }
    setEditingSectionId(null);
    setEditingSectionName("");
  }, [editingSectionId, editingSectionName, state.sections, onUpdate]);

  const cancelEditingSectionName = useCallback(() => {
    setEditingSectionId(null);
    setEditingSectionName("");
  }, []);

  const addSection = useCallback(() => {
    const colorIndex = state.sections.length % SECTION_COLORS.length;
    const newSection: Section = {
      id: crypto.randomUUID(),
      name: "New Section",
      itemIds: [],
      collapsed: false,
      color: SECTION_COLORS[colorIndex],
      displayOrder: state.sections.length,
    };
    const updated = [...state.sections, newSection];
    onUpdate({ sections: updated });
    // Auto-enter edit mode for the new section name
    setEditingSectionId(newSection.id);
    setEditingSectionName(newSection.name);
  }, [state.sections, onUpdate]);

  const deleteSection = useCallback(
    (sectionId: string) => {
      const updated = state.sections.filter((s) => s.id !== sectionId);
      onUpdate({ sections: updated });
    },
    [state.sections, onUpdate]
  );

  const parentCategories = useMemo(
    () =>
      state.includedCategories.length > 0
        ? state.includedCategories
        : [...ALL_PARENT_CATEGORIES],
    [state.includedCategories]
  );

  const unsectionedItems = useMemo(
    () =>
      getUnsectionedItems(state.sections, parentCategories, goals, investments),
    [state.sections, parentCategories, goals, investments]
  );

  const isHidden = useCallback(
    (itemId: string) => state.hiddenItemIds.includes(itemId),
    [state.hiddenItemIds]
  );

  const toggleHidden = useCallback(
    (itemId: string) => {
      const current = [...state.hiddenItemIds];
      const idx = current.indexOf(itemId);
      if (idx >= 0) {
        current.splice(idx, 1);
      } else {
        current.push(itemId);
      }
      onUpdate({ hiddenItemIds: current });
    },
    [state.hiddenItemIds, onUpdate]
  );

  const toggleSectionCollapse = useCallback(
    (sectionId: string) => {
      const updated = state.sections.map((s) =>
        s.id === sectionId ? { ...s, collapsed: !s.collapsed } : s
      );
      onUpdate({ sections: updated });
    },
    [state.sections, onUpdate]
  );

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { source, destination, draggableId } = result;
      if (!destination) return;
      if (
        source.droppableId === destination.droppableId &&
        source.index === destination.index
      )
        return;

      const newSections = state.sections.map((s) => ({
        ...s,
        itemIds: [...s.itemIds],
      }));

      if (source.droppableId !== "unsectioned") {
        const srcSection = newSections.find(
          (s) => s.id === source.droppableId
        );
        if (srcSection) {
          srcSection.itemIds.splice(source.index, 1);
        }
      }

      if (destination.droppableId !== "unsectioned") {
        const destSection = newSections.find(
          (s) => s.id === destination.droppableId
        );
        if (destSection) {
          destSection.itemIds.splice(destination.index, 0, draggableId);
        }
      }

      onUpdate({ sections: newSections });
    },
    [state.sections, onUpdate]
  );

  return (
    <div>
      <h2
        className="font-[family-name:var(--font-nunito)] text-2xl md:text-3xl font-bold mb-2"
        style={{ color: "var(--text-primary)" }}
      >
        Fine-tune Settings
      </h2>
      <p
        className="text-base mb-8"
        style={{ color: "var(--text-secondary)" }}
      >
        Adjust how your budget works and organise your categories.
      </p>

      {/* Period type */}
      <div className="mb-6">
        <Label
          className="text-sm font-medium mb-3 block"
          style={{ color: "var(--text-primary)" }}
        >
          Budget Period
        </Label>
        <div className="flex gap-2">
          {PERIOD_OPTIONS.map((opt) => {
            const isSelected = state.periodType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onUpdate({ periodType: opt.value })}
                className="flex-1 rounded-xl px-4 py-2.5 text-center border cursor-pointer transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-brand-coral focus-visible:ring-offset-2"
                style={{
                  backgroundColor: isSelected
                    ? "var(--brand-coral)"
                    : "var(--surface-elevated)",
                  borderColor: isSelected
                    ? "var(--brand-coral)"
                    : "var(--border)",
                  color: isSelected ? "white" : "var(--text-primary)",
                }}
                aria-pressed={isSelected}
              >
                <span className="text-sm font-[family-name:var(--font-nunito)] font-bold">
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Budget view (for household) */}
      {state.budgetType === "household" && (
        <div className="mb-6">
          <Label
            className="text-sm font-medium mb-3 block"
            style={{ color: "var(--text-primary)" }}
          >
            Default View
          </Label>
          <div className="flex gap-2">
            {[
              { value: "shared" as const, label: "Shared (Our Budget)" },
              {
                value: "individual" as const,
                label: "Individual (My Share)",
              },
            ].map((opt) => {
              const isSelected = state.budgetView === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onUpdate({ budgetView: opt.value })}
                  className="flex-1 rounded-xl px-4 py-2.5 text-center border cursor-pointer transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-brand-coral focus-visible:ring-offset-2"
                  style={{
                    backgroundColor: isSelected
                      ? "var(--brand-coral)"
                      : "var(--surface-elevated)",
                    borderColor: isSelected
                      ? "var(--brand-coral)"
                      : "var(--border)",
                    color: isSelected ? "white" : "var(--text-primary)",
                  }}
                  aria-pressed={isSelected}
                >
                  <span className="text-sm font-[family-name:var(--font-nunito)] font-bold">
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Category layout — drag and drop sections */}
      <div className="mb-8">
        <Label
          className="text-sm font-medium mb-3 block"
          style={{ color: "var(--text-primary)" }}
        >
          Category Layout
        </Label>
        <p
          className="text-xs mb-2"
          style={{ color: "var(--text-tertiary)" }}
        >
          Drag subcategories between sections to organise your budget. Toggle
          the eye icon to hide categories you don&rsquo;t need.
        </p>
        <p
          className="text-xs mb-4 flex items-start gap-1.5 rounded-lg px-3 py-2"
          style={{
            color: "var(--text-secondary)",
            backgroundColor: "var(--pastel-mint-light, var(--muted))",
          }}
        >
          <Eye
            className="w-3.5 h-3.5 mt-0.5 shrink-0"
            style={{
              color: "var(--pastel-mint-dark, var(--text-secondary))",
            }}
            aria-hidden="true"
          />
          <span>
            Hidden categories will automatically reappear if you spend in
            them &mdash; so you&rsquo;ll never miss a transaction.
          </span>
        </p>

        {dndEnabled ? (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="space-y-3">
              {/* Template sections */}
              {state.sections.map((section) => (
                <div
                  key={section.id}
                  className="rounded-2xl border overflow-hidden"
                  style={{
                    backgroundColor: "var(--surface-elevated)",
                    borderColor: "var(--border)",
                  }}
                >
                  {/* Section header */}
                  <div
                    className="w-full flex items-center gap-2 px-4 py-2.5"
                    style={{
                      borderBottom: section.collapsed
                        ? undefined
                        : "1px solid var(--border)",
                    }}
                  >
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: section.color }}
                    />

                    {editingSectionId === section.id ? (
                      <Input
                        type="text"
                        value={editingSectionName}
                        onChange={(e) =>
                          setEditingSectionName(e.target.value)
                        }
                        onBlur={saveSectionName}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveSectionName();
                          if (e.key === "Escape") cancelEditingSectionName();
                        }}
                        autoFocus
                        className="flex-1 h-7 text-sm font-[family-name:var(--font-nunito)] font-bold px-2 py-1 rounded"
                        style={{ color: "var(--text-primary)" }}
                      />
                    ) : (
                      <>
                        <span
                          className="text-sm font-[family-name:var(--font-nunito)] font-bold flex-1 text-left"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {section.name}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditingSectionName(
                              section.id,
                              section.name
                            );
                          }}
                          className="shrink-0 p-1 rounded cursor-pointer opacity-0 hover:opacity-100 transition-opacity"
                          aria-label={`Edit ${section.name}`}
                          title="Edit section name"
                        >
                          <Pencil
                            className="w-3 h-3"
                            style={{ color: "var(--text-secondary)" }}
                          />
                        </button>
                      </>
                    )}

                    {section.percentage && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          color: section.color,
                          backgroundColor: `color-mix(in srgb, ${section.color} 12%, transparent)`,
                        }}
                      >
                        {section.percentage}%
                      </span>
                    )}
                    <span
                      className="text-xs tabular-nums"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {section.itemIds.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleSectionCollapse(section.id)}
                      className="cursor-pointer p-1 rounded hover:bg-black/5"
                      aria-label={
                        section.collapsed
                          ? `Expand ${section.name}`
                          : `Collapse ${section.name}`
                      }
                    >
                      {section.collapsed ? (
                        <ChevronRight
                          className="w-4 h-4"
                          style={{ color: "var(--text-tertiary)" }}
                          aria-hidden="true"
                        />
                      ) : (
                        <ChevronDown
                          className="w-4 h-4"
                          style={{ color: "var(--text-tertiary)" }}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSection(section.id);
                      }}
                      className="shrink-0 p-1 rounded cursor-pointer opacity-0 hover:opacity-100 transition-opacity"
                      aria-label={`Delete ${section.name}`}
                      title="Delete section"
                    >
                      <X
                        className="w-3.5 h-3.5"
                        style={{ color: "var(--text-tertiary)" }}
                      />
                    </button>
                  </div>

                  {/* Droppable area */}
                  {!section.collapsed && (
                    <Droppable droppableId={section.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className="min-h-[36px] px-1 py-1 transition-colors duration-150"
                          style={{
                            backgroundColor: snapshot.isDraggingOver
                              ? `color-mix(in srgb, ${section.color} 6%, transparent)`
                              : undefined,
                          }}
                        >
                          {section.itemIds.map((itemId, index) => (
                            <Draggable
                              key={itemId}
                              draggableId={itemId}
                              index={index}
                            >
                              {(dragProvided, dragSnapshot) => (
                                <div
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  {...dragProvided.dragHandleProps}
                                  className="flex items-center gap-2 px-3 py-2 rounded-xl mx-1 my-0.5 transition-shadow"
                                  style={{
                                    ...dragProvided.draggableProps.style,
                                    backgroundColor:
                                      dragSnapshot.isDragging
                                        ? "var(--surface-elevated)"
                                        : undefined,
                                    boxShadow: dragSnapshot.isDragging
                                      ? "0 4px 12px rgba(0,0,0,0.15)"
                                      : undefined,
                                    opacity: isHidden(itemId) ? 0.4 : 1,
                                  }}
                                >
                                  <GripVertical
                                    className="w-3.5 h-3.5 shrink-0"
                                    style={{
                                      color: "var(--text-tertiary)",
                                    }}
                                    aria-hidden="true"
                                  />
                                  <ItemTypeIcon itemId={itemId} />
                                  <div className="flex-1 min-w-0">
                                    <span
                                      className="text-sm block truncate"
                                      style={{
                                        color: isHidden(itemId)
                                          ? "var(--text-tertiary)"
                                          : "var(--text-primary)",
                                      }}
                                    >
                                      {itemLabel(
                                        itemId,
                                        goalMap,
                                        investmentMap
                                      )}
                                    </span>
                                    <span
                                      className="text-[10px] block truncate"
                                      style={{
                                        color: "var(--text-tertiary)",
                                      }}
                                    >
                                      {itemParent(itemId)}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleHidden(itemId);
                                    }}
                                    className="shrink-0 p-1 rounded cursor-pointer"
                                    aria-label={
                                      isHidden(itemId)
                                        ? `Show ${itemLabel(itemId, goalMap, investmentMap)}`
                                        : `Hide ${itemLabel(itemId, goalMap, investmentMap)}`
                                    }
                                  >
                                    {isHidden(itemId) ? (
                                      <EyeOff
                                        className="w-3.5 h-3.5"
                                        style={{
                                          color: "var(--text-tertiary)",
                                        }}
                                      />
                                    ) : (
                                      <Eye
                                        className="w-3.5 h-3.5"
                                        style={{
                                          color: "var(--text-secondary)",
                                        }}
                                      />
                                    )}
                                  </button>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  )}
                </div>
              ))}

              {/* Add Section button */}
              <button
                type="button"
                onClick={addSection}
                className="w-full rounded-2xl border-2 border-dashed p-3 flex items-center justify-center gap-2 cursor-pointer transition-colors duration-200 hover:border-[var(--brand-coral)] hover:bg-[var(--pastel-coral-light,rgba(248,113,113,0.04))]"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text-secondary)",
                }}
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span className="text-sm font-[family-name:var(--font-nunito)] font-bold">
                  Add Section
                </span>
              </button>

              {/* Unsectioned items */}
              {unsectionedItems.length > 0 && (
                <div
                  className="rounded-2xl border overflow-hidden"
                  style={{
                    backgroundColor: "var(--surface-elevated)",
                    borderColor: "var(--border)",
                    borderStyle: "dashed",
                  }}
                >
                  <div
                    className="px-4 py-2.5"
                    style={{
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <span
                      className="text-sm font-[family-name:var(--font-nunito)] font-bold"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Unsectioned
                    </span>
                    <span
                      className="text-xs ml-2 tabular-nums"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {unsectionedItems.length}
                    </span>
                  </div>
                  <Droppable droppableId="unsectioned">
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="min-h-[36px] px-1 py-1 transition-colors duration-150"
                        style={{
                          backgroundColor: snapshot.isDraggingOver
                            ? "var(--muted)"
                            : undefined,
                        }}
                      >
                        {unsectionedItems.map((itemId, index) => (
                          <Draggable
                            key={itemId}
                            draggableId={itemId}
                            index={index}
                          >
                            {(dragProvided, dragSnapshot) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl mx-1 my-0.5 transition-shadow"
                                style={{
                                  ...dragProvided.draggableProps.style,
                                  backgroundColor:
                                    dragSnapshot.isDragging
                                      ? "var(--surface-elevated)"
                                      : undefined,
                                  boxShadow: dragSnapshot.isDragging
                                    ? "0 4px 12px rgba(0,0,0,0.15)"
                                    : undefined,
                                  opacity: isHidden(itemId) ? 0.4 : 1,
                                }}
                              >
                                <GripVertical
                                  className="w-3.5 h-3.5 shrink-0"
                                  style={{
                                    color: "var(--text-tertiary)",
                                  }}
                                  aria-hidden="true"
                                />
                                <div className="flex-1 min-w-0">
                                  <span
                                    className="text-sm block truncate"
                                    style={{
                                      color: isHidden(itemId)
                                        ? "var(--text-tertiary)"
                                        : "var(--text-primary)",
                                    }}
                                  >
                                    {itemLabel(
                                      itemId,
                                      goalMap,
                                      investmentMap
                                    )}
                                  </span>
                                  <span
                                    className="text-[10px] block truncate"
                                    style={{
                                      color: "var(--text-tertiary)",
                                    }}
                                  >
                                    {itemParent(itemId)}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleHidden(itemId);
                                  }}
                                  className="shrink-0 p-1 rounded cursor-pointer"
                                  aria-label={
                                    isHidden(itemId)
                                      ? `Show ${itemLabel(itemId, goalMap, investmentMap)}`
                                      : `Hide ${itemLabel(itemId, goalMap, investmentMap)}`
                                  }
                                >
                                  {isHidden(itemId) ? (
                                    <EyeOff
                                      className="w-3.5 h-3.5"
                                      style={{
                                        color: "var(--text-tertiary)",
                                      }}
                                    />
                                  ) : (
                                    <Eye
                                      className="w-3.5 h-3.5"
                                      style={{
                                        color: "var(--text-secondary)",
                                      }}
                                    />
                                  )}
                                </button>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              )}

              {/* No sections fallback */}
              {state.sections.length === 0 &&
                unsectionedItems.length === 0 && (
                  <div
                    className="rounded-2xl border border-dashed p-6 text-center"
                    style={{
                      borderColor: "var(--border)",
                    }}
                  >
                    <p
                      className="text-sm"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      Use &ldquo;Add Section&rdquo; above to create custom
                      groupings, or select a template in the previous step for
                      pre-configured sections.
                    </p>
                  </div>
                )}
            </div>
          </DragDropContext>
        ) : (
          <div className="flex items-center justify-center h-32">
            <div
              className="animate-pulse text-sm"
              style={{ color: "var(--text-tertiary)" }}
            >
              Loading...
            </div>
          </div>
        )}
      </div>

      {/* Continue */}
      <Button
        onClick={onNext}
        size="lg"
        className="w-full rounded-xl h-12 text-base font-[family-name:var(--font-nunito)] font-bold cursor-pointer"
        style={{
          backgroundColor: "var(--brand-coral)",
          color: "white",
        }}
      >
        Review Budget
      </Button>
    </div>
  );
}
