"use client";

import { useMemo, useCallback, useState, useEffect } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import {
  GripVertical,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Target,
  TrendingUp,
  Layers,
  Save,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useBudgetLayout } from "@/contexts/budget-layout-context";
import { generateItemId } from "@/lib/layout-persistence";
import type { BudgetItemWithLayout } from "@/types/budget-layout";

const DENSITY_OPTIONS = [
  { id: "compact" as const, label: "Compact" },
  { id: "comfortable" as const, label: "Comfortable" },
  { id: "spacious" as const, label: "Spacious" },
];

interface BudgetCategoryLayoutEditorProps {
  allItems: BudgetItemWithLayout[];
}

function ItemTypeIcon({ type }: { type: string }) {
  if (type === "goal")
    return (
      <Target
        className="w-3 h-3 shrink-0"
        style={{ color: "var(--pastel-mint-dark, #34D399)" }}
        aria-hidden="true"
      />
    );
  if (type === "asset")
    return (
      <TrendingUp
        className="w-3 h-3 shrink-0"
        style={{ color: "var(--pastel-coral-dark, #F87171)" }}
        aria-hidden="true"
      />
    );
  return null;
}

export function BudgetCategoryLayoutEditor({
  allItems,
}: BudgetCategoryLayoutEditorProps) {
  const {
    sections,
    density,
    isDirty,
    saving,
    setDensity,
    saveLayout,
    resetToDefault,
    moveItemToSection,
    hideItem,
    showItem,
    isItemHidden,
    getSectionItems,
    getUnsectionedItems,
    toggleSectionCollapse,
  } = useBudgetLayout();

  // Defer DnD rendering to avoid React 19 StrictMode double-mount errors
  // (@hello-pangea/dnd loses track of drag handle DOM nodes during unmount/remount)
  const [dndEnabled, setDndEnabled] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDndEnabled(true));
    return () => {
      cancelAnimationFrame(frame);
      setDndEnabled(false);
    };
  }, []);

  // Build item ID → item data lookup from allItems
  const itemLookup = useMemo(() => {
    const map = new Map<
      string,
      { name: string; parentCategory?: string; icon: string; type: string }
    >();
    for (const item of allItems) {
      let itemId: string;
      if (item.type === "subcategory") {
        itemId = generateItemId(item.type, item.name, item.parentCategory);
      } else if (item.type === "category") {
        itemId = generateItemId(item.type, item.name);
      } else {
        itemId = generateItemId(item.type === "goal" ? "goal" : "asset", item.id);
      }
      map.set(itemId, {
        name: item.name,
        parentCategory: item.parentCategory,
        icon: item.icon,
        type: item.type,
      });
    }
    return map;
  }, [allItems]);

  // All item IDs for getUnsectionedItems
  const allItemIds = useMemo(
    () => Array.from(itemLookup.keys()),
    [itemLookup]
  );

  const unsectionedItemIds = useMemo(
    () => getUnsectionedItems(allItemIds),
    [getUnsectionedItems, allItemIds]
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

      const sourceSectionId =
        source.droppableId === "unsectioned" ? null : source.droppableId;
      const targetSectionId =
        destination.droppableId === "unsectioned"
          ? null
          : destination.droppableId;

      moveItemToSection(
        draggableId,
        targetSectionId,
        destination.index,
        sourceSectionId
      );
    },
    [moveItemToSection]
  );

  const toggleVisibility = useCallback(
    (itemId: string) => {
      if (isItemHidden(itemId)) {
        showItem(itemId);
      } else {
        hideItem(itemId);
      }
    },
    [isItemHidden, showItem, hideItem]
  );

  const renderDraggableItem = useCallback(
    (itemId: string, index: number) => {
      const info = itemLookup.get(itemId);
      const hidden = isItemHidden(itemId);
      const name = info?.name ?? itemId;
      const parent = info?.parentCategory ?? "";
      const type = info?.type ?? "";

      return (
        <Draggable key={itemId} draggableId={itemId} index={index}>
          {(dragProvided, dragSnapshot) => (
            <div
              ref={dragProvided.innerRef}
              {...dragProvided.draggableProps}
              {...dragProvided.dragHandleProps}
              className="flex items-center gap-2 px-3 py-2 rounded-xl mx-1 my-0.5 transition-shadow"
              style={{
                ...dragProvided.draggableProps.style,
                backgroundColor: dragSnapshot.isDragging
                  ? "var(--surface-elevated)"
                  : undefined,
                boxShadow: dragSnapshot.isDragging
                  ? "0 4px 12px rgba(0,0,0,0.15)"
                  : undefined,
                opacity: hidden ? 0.4 : 1,
              }}
            >
              <GripVertical
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: "var(--text-tertiary)" }}
                aria-hidden="true"
              />
              <ItemTypeIcon type={type} />
              <div className="flex-1 min-w-0">
                <span
                  className="text-sm block truncate"
                  style={{
                    color: hidden
                      ? "var(--text-tertiary)"
                      : "var(--text-primary)",
                  }}
                >
                  {name}
                </span>
                {parent && (
                  <span
                    className="text-[10px] block truncate"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {parent}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleVisibility(itemId);
                }}
                className="shrink-0 p-1 rounded cursor-pointer"
                aria-label={hidden ? `Show ${name}` : `Hide ${name}`}
              >
                {hidden ? (
                  <EyeOff
                    className="w-3.5 h-3.5"
                    style={{ color: "var(--text-tertiary)" }}
                  />
                ) : (
                  <Eye
                    className="w-3.5 h-3.5"
                    style={{ color: "var(--text-secondary)" }}
                  />
                )}
              </button>
            </div>
          )}
        </Draggable>
      );
    },
    [itemLookup, isItemHidden, toggleVisibility]
  );

  return (
    <div className="space-y-5">
      {/* Row Density */}
      <div>
        <h3
          className="font-[family-name:var(--font-nunito)] font-bold text-sm mb-3 flex items-center gap-2"
          style={{ color: "var(--text-secondary)" }}
        >
          <Layers className="h-4 w-4" />
          Row Density
        </h3>
        <div
          className="flex gap-1 p-1 rounded-xl"
          style={{ backgroundColor: "var(--surface-secondary, var(--muted))" }}
        >
          {DENSITY_OPTIONS.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDensity(d.id)}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                density === d.id ? "shadow-sm" : "hover:bg-white/50"
              }`}
              style={{
                backgroundColor:
                  density === d.id ? "white" : "transparent",
                color:
                  density === d.id
                    ? "var(--pastel-blue-dark)"
                    : "var(--text-secondary)",
              }}
              aria-pressed={density === d.id}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category Layout */}
      <div>
        <h3
          className="font-[family-name:var(--font-nunito)] font-bold text-sm mb-3"
          style={{ color: "var(--text-secondary)" }}
        >
          Category Layout
        </h3>
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
            style={{ color: "var(--pastel-mint-dark, var(--text-secondary))" }}
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
            {/* Sections */}
            {sections.map((section) => {
              const sectionItemIds = getSectionItems(section.id);
              return (
                <div
                  key={section.id}
                  className="rounded-2xl border overflow-hidden"
                  style={{
                    backgroundColor: "var(--surface-elevated)",
                    borderColor: "var(--border)",
                  }}
                >
                  {/* Section header */}
                  <button
                    type="button"
                    onClick={() => toggleSectionCollapse(section.id)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 cursor-pointer"
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
                    <span
                      className="text-sm font-[family-name:var(--font-nunito)] font-bold flex-1 text-left"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {section.name}
                    </span>
                    {section.percentage !== undefined && (
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
                      {sectionItemIds.length}
                    </span>
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
                          {sectionItemIds.map((itemId, index) =>
                            renderDraggableItem(itemId, index)
                          )}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  )}
                </div>
              );
            })}

            {/* Unsectioned items */}
            {unsectionedItemIds.length > 0 && (
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
                  style={{ borderBottom: "1px solid var(--border)" }}
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
                    {unsectionedItemIds.length}
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
                      {unsectionedItemIds.map((itemId, index) =>
                        renderDraggableItem(itemId, index)
                      )}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            )}

            {/* No sections and no items */}
            {sections.length === 0 && unsectionedItemIds.length === 0 && (
              <div
                className="rounded-2xl border border-dashed p-6 text-center"
                style={{ borderColor: "var(--border)" }}
              >
                <p
                  className="text-sm"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  No layout sections configured. Create a new budget with a
                  template to get pre-configured sections.
                </p>
              </div>
            )}
          </div>
        </DragDropContext>
        ) : (
          <div className="space-y-3 animate-pulse">
            {sections.map((section) => (
              <div key={section.id} className="rounded-2xl border h-12" style={{ borderColor: "var(--border)" }} />
            ))}
          </div>
        )}
      </div>

      {/* Save / Reset footer */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => resetToDefault()}
          disabled={saving}
          className="rounded-xl h-9 text-xs cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Reset to Default
        </Button>
        <div className="flex items-center gap-3">
          {isDirty && (
            <Badge
              variant="secondary"
              className="rounded-full text-xs"
              style={{
                backgroundColor: "var(--pastel-yellow-light)",
                color: "var(--pastel-yellow-dark)",
              }}
            >
              Unsaved changes
            </Badge>
          )}
          <Button
            size="sm"
            onClick={() => saveLayout()}
            disabled={!isDirty || saving}
            className="rounded-xl h-9 text-xs cursor-pointer"
            style={{
              backgroundColor: isDirty
                ? "var(--brand-coral)"
                : "var(--surface-secondary, var(--muted))",
              color: isDirty ? "white" : "var(--text-tertiary)",
            }}
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? "Saving..." : isDirty ? "Save Layout" : "Saved"}
          </Button>
        </div>
      </div>
    </div>
  );
}
