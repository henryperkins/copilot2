import React from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { PropsWithChildren } from "react";

interface Props {
  onClick: () => void;
  Icon: React.ReactNode;
  disabled?: boolean; // Add disabled prop
}

export function TooltipActionButton({
  onClick,
  Icon,
  children,
  disabled = false,
}: PropsWithChildren<Props>) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button className="chat-icon-button clickable-icon" onClick={onClick} disabled={disabled}>
          {Icon}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal container={activeDocument.body}>
        <Tooltip.Content sideOffset={5} className="tooltip-text">
          {children}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
