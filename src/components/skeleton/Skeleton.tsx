import type { CSSProperties } from "react";
import "../../styles/skeleton.scss";

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  circle?: boolean;
  style?: CSSProperties;
}

export function Skeleton({ className = "", width, height, circle, style: extraStyle }: SkeletonProps) {
  const style: CSSProperties = {
    width,
    height,
    borderRadius: circle ? "50%" : "4px",
    ...extraStyle,
  };

  return <div className={`skeleton-pulse ${className}`} style={style} />;
}

export function DocumentDetailSkeleton() {
  return (
    <div className="doc-detail-skeleton">
      <div className="doc-detail-skeleton-header">
        <Skeleton width="40%" height="2rem" />
        <Skeleton width="15%" height="1rem" className="mt-2" />
      </div>
      <div className="doc-detail-skeleton-content">
        <Skeleton width="100%" height="1.2rem" className="mb-2" />
        <Skeleton width="100%" height="1.2rem" className="mb-2" />
        <Skeleton width="80%" height="1.2rem" className="mb-4" />

        <Skeleton width="100%" height="1.2rem" className="mb-2" />
        <Skeleton width="90%" height="1.2rem" className="mb-2" />
        <Skeleton width="100%" height="1.2rem" className="mb-2" />
        <Skeleton width="40%" height="1.2rem" />
      </div>
    </div>
  );
}
