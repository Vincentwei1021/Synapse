"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { NotificationPopup } from "@/components/notification-popup";

export function NotificationBell() {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-auto p-0 rounded-lg"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <NotificationPopup onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
