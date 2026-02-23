import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import "./popover.scss";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  body: string;
  position?: "top" | "bottom" | "left" | "right";
  targetSelector: string; // CSS selector of the element to point to
  offset?: number;
  actionButton?: React.ReactNode;
};

export const Popover: React.FC<Props> = ({
  isOpen,
  onClose,
  title,
  body,
  position = "top",
  targetSelector,
  offset = 12,
  actionButton,
}) => {
  const [style, setStyle] = useState<React.CSSProperties>({});
  const [arrowStyle, setArrowStyle] = useState<{ [key: string]: string }>({});
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsVisible(false);
      return;
    }

    const updatePosition = () => {
      const target = document.querySelector(targetSelector);
      if (!target) return;

      const rect = target.getBoundingClientRect();
      const newStyle: React.CSSProperties = {};
      let arrowLeft = "50%";
      let arrowTop = "50%";

      // Basic positioning logic based on the requested side
      const POPOVER_WIDTH = 260;
      const PADDING = 12;

      if (position === "left") {
        newStyle.top = rect.top + rect.height / 2;
        newStyle.right = window.innerWidth - rect.left + offset;
        newStyle.transform = "translateY(-50%)";
      } else if (position === "top" || position === "bottom") {
        let leftBase = rect.left + rect.width / 2;
        let originalLeftBase = leftBase;
        let leftAdjusted = leftBase - POPOVER_WIDTH / 2;

        // Horizontally clamp so the 260px wide popover fits on screen
        if (leftAdjusted < PADDING) {
          leftBase = PADDING + POPOVER_WIDTH / 2;
        } else if (leftAdjusted + POPOVER_WIDTH > window.innerWidth - PADDING) {
          leftBase = window.innerWidth - PADDING - POPOVER_WIDTH / 2;
        }

        newStyle.left = leftBase;
        newStyle.transform = "translateX(-50%)";

        // Calculate offset for arrow to stick to the original target center
        const shiftAmount = originalLeftBase - leftBase;
        arrowLeft = `calc(50% + ${shiftAmount}px)`;

        if (position === "top") {
          newStyle.bottom = window.innerHeight - rect.top + offset;
        } else {
          newStyle.top = rect.bottom + offset;
        }
      } else if (position === "right") {
        newStyle.top = rect.top + rect.height / 2;
        newStyle.left = rect.right + offset;
        newStyle.transform = "translateY(-50%)";
      }

      setStyle(newStyle);
      setArrowStyle({
        "--arrow-left": arrowLeft,
        "--arrow-top": arrowTop,
      });
      setIsVisible(true);
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [isOpen, targetSelector, position, offset]);

  if (!isOpen && !isVisible) return null;

  return (
    <div
      className={`onboarding-popover ${position} ${isVisible ? "visible" : ""}`}
      style={{ ...style, ...arrowStyle } as React.CSSProperties}
    >
      <div className="popover-header">
        <h4>{title}</h4>
        <button onClick={onClose} className="popover-close">
          <X size={14} />
        </button>
      </div>
      <p className="popover-body">{body}</p>
      {actionButton && (
        <div
          className="popover-action"
          style={{ marginTop: "12px", textAlign: "right" }}
        >
          {actionButton}
        </div>
      )}
      <div className="popover-arrow" />
    </div>
  );
};
