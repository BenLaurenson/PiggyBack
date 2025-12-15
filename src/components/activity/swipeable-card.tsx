"use client";

import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { Trash2, DollarSign, Users, StickyNote } from "lucide-react";
import { ReactNode, useState } from "react";

interface SwipeableCardProps {
  children: ReactNode;
  onSwipeLeft?: () => void; // Delete
  onSwipeRight?: () => void; // Mark as Income
  onShare?: () => void;
  onNote?: () => void;
  disabled?: boolean;
  disableSwipe?: boolean;
}

export function SwipeableCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  onShare,
  onNote,
  disabled = false,
  disableSwipe = false
}: SwipeableCardProps) {
  const [isRevealed, setIsRevealed] = useState<'left' | 'right' | null>(null);
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-150, 0, 150], [1, 0, 1]);
  const rightActionOpacity = useTransform(x, [-150, 0, 150], [0, 0, 1]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    const threshold = 120;

    if (info.offset.x > threshold && onSwipeRight) {
      // Swipe right - Mark as Income
      x.set(200);
      setTimeout(() => {
        onSwipeRight();
        x.set(0);
      }, 250);
    } else if (info.offset.x < -threshold && onSwipeLeft) {
      // Swipe left - Delete
      x.set(-200);
      setTimeout(() => {
        onSwipeLeft();
        x.set(0);
      }, 250);
    } else {
      // Snap back
      x.set(0);
    }
  };

  if (disabled || disableSwipe) {
    return <>{children}</>;
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Left Action Background (Delete) */}
      <motion.div
        className="absolute inset-0 flex items-center justify-end px-6 rounded-2xl"
        style={{
          backgroundColor: 'var(--pastel-coral)',
          opacity
        }}
      >
        <div className="flex items-center gap-2 text-white">
          <Trash2 className="h-5 w-5" />
          <span className="font-bold">Delete</span>
        </div>
      </motion.div>

      {/* Right Action Background (Mark as Income) */}
      <motion.div
        className="absolute inset-0 flex items-center justify-start px-6 rounded-2xl"
        style={{
          backgroundColor: 'var(--grass-9)',
          opacity: rightActionOpacity
        }}
      >
        <div className="flex items-center gap-2 text-white">
          <DollarSign className="h-5 w-5" />
          <span className="font-bold">Mark Income</span>
        </div>
      </motion.div>

      {/* Draggable Card */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -150, right: 150 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className="relative z-10"
      >
        {children}
      </motion.div>

      {/* Quick Action Buttons (visible on tap/hover) */}
      <motion.div
        className="absolute top-2 right-2 flex gap-1 z-20"
        initial={{ opacity: 0, scale: 0.8 }}
        whileHover={{ opacity: 1, scale: 1 }}
        whileTap={{ opacity: 1, scale: 1 }}
      >
        {onShare && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onShare();
            }}
            className="p-2 rounded-lg transition-all active:scale-95"
            style={{
              backgroundColor: 'var(--violet-4)',
              border: '1px solid var(--violet-7)'
            }}
          >
            <Users className="h-4 w-4" style={{ color: 'var(--violet-11)' }} />
          </button>
        )}
        {onNote && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNote();
            }}
            className="p-2 rounded-lg transition-all active:scale-95"
            style={{
              backgroundColor: 'var(--amber-4)',
              border: '1px solid var(--amber-7)'
            }}
          >
            <StickyNote className="h-4 w-4" style={{ color: 'var(--amber-11)' }} />
          </button>
        )}
      </motion.div>
    </div>
  );
}
