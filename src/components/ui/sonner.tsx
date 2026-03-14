"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { GooeyToaster, type GooeyToasterProps } from "goey-toast"

const Toaster = ({ ...props }: GooeyToasterProps) => {
  return (
    <GooeyToaster
      position="top-center"
      bounce={0.3}
      {...props}
    />
  )
}

export { Toaster }
