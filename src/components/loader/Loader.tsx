import { Loader2 } from "lucide-react";

interface LoaderProps {
  size?: number;
  className?: string;
}

export function Loader({ size = 18, className = "" }: LoaderProps) {
  return <Loader2 size={size} className={`icon-spin ${className}`} />;
}
