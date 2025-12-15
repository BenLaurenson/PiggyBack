"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { GoeyToaster, type GoeyToasterProps } from "goey-toast"

const Toaster = ({ ...props }: GoeyToasterProps) => {
  return (
    <GoeyToaster
      position="top-center"
      bounce={0.3}
      {...props}
    />
  )
}

export { Toaster }
