import React from "react";
import { Loader2 } from "lucide-react";

interface LoaderProps {
  size?: number;
  className?: string;
}

export const Loader: React.FC<LoaderProps> = ({
  size = 18,
  className = "",
}) => {
  return (
    <Loader2
      size={size}
      className={`icon-spin ${className}`}
      style={{ animation: "spin 1s linear infinite" }}
    />
  );
};
