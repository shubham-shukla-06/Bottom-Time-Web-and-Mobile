import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4 sm:gap-6",
        month: "flex flex-col gap-3",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-semibold text-slate-800 tracking-tight",
        nav: "flex items-center gap-1",
        nav_button: cn(
          "h-8 w-8 bg-transparent p-0 rounded-lg border border-slate-200",
          "text-slate-500 hover:text-cyan-600 hover:border-cyan-300 hover:bg-cyan-50",
          "transition-all duration-150 inline-flex items-center justify-center"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse",
        head_row: "flex",
        head_cell:
          "text-slate-400 rounded-md w-9 font-medium text-[0.7rem] uppercase tracking-wider",
        row: "flex w-full mt-1",
        cell: cn(
          "relative p-0.5 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-cyan-50 [&:has([aria-selected].day-outside)]:bg-cyan-50/40 [&:has([aria-selected].day-range-end)]:rounded-r-md",
          props.mode === "range"
            ? "[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
            : "[&:has([aria-selected])]:rounded-lg"
        ),
        day: cn(
          "h-9 w-9 p-0 font-normal rounded-lg inline-flex items-center justify-center",
          "text-slate-700 hover:bg-cyan-50 hover:text-cyan-700",
          "transition-colors duration-150 cursor-pointer",
          "aria-selected:opacity-100"
        ),
        day_range_start: "day-range-start",
        day_range_end: "day-range-end",
        day_selected:
          "bg-cyan-500 text-white hover:bg-cyan-600 hover:text-white focus:bg-cyan-500 focus:text-white font-semibold shadow-sm shadow-cyan-500/30",
        day_today: "bg-slate-100 text-slate-900 font-semibold",
        day_outside:
          "day-outside text-slate-300 aria-selected:bg-cyan-50/40 aria-selected:text-slate-400",
        day_disabled: "text-slate-300 opacity-40 cursor-not-allowed hover:bg-transparent",
        day_range_middle:
          "aria-selected:bg-cyan-50 aria-selected:text-cyan-800",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ className, ...props }) => (
          <ChevronLeft className={cn("h-4 w-4", className)} {...props} />
        ),
        IconRight: ({ className, ...props }) => (
          <ChevronRight className={cn("h-4 w-4", className)} {...props} />
        ),
      }}
      {...props} />
  );
}
Calendar.displayName = "Calendar"

export { Calendar }
