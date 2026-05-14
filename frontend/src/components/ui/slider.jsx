import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

const Slider = React.forwardRef(({ className, color, ...props }, ref) => {
  const isCyan = color === 'cyan';
  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn("relative flex w-full touch-none select-none items-center", className)}
      {...props}>
      <SliderPrimitive.Track
        className={cn("relative h-1.5 w-full grow overflow-hidden rounded-full", isCyan ? "bg-cyan-100" : "bg-primary/20")}>
        <SliderPrimitive.Range className={cn("absolute h-full", isCyan ? "bg-cyan-400" : "bg-primary")} />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className={cn("block h-4 w-4 rounded-full border bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
          isCyan ? "border-cyan-400 focus-visible:ring-cyan-300" : "border-primary/50")} />
    </SliderPrimitive.Root>
  );
})
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
