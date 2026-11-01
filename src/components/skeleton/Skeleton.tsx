import type { CSSProperties, ReactNode } from "react";
import "../../styles/skeleton.scss";

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  circle?: boolean;
  style?: CSSProperties;
}

// A span, so it can stand in for text inside headings, paragraphs and table cells.
export function Skeleton({ className = "", width, height, circle, style: extraStyle }: SkeletonProps) {
  const style: CSSProperties = {
    width,
    height,
    ...(circle && { borderRadius: "50%" }),
    ...extraStyle,
  };

  return <span className={`skeleton-pulse ${className}`} style={style} aria-hidden="true" />;
}

// One line of the surrounding text: put it inside the element whose text it replaces.
export function SkeletonLine({ width }: { width: string | number }) {
  return <Skeleton className="skeleton-line" width={width} />;
}

type SkeletonRegionProps = {
  label: string;
  className?: string;
  children: ReactNode;
};

// Wraps placeholder content: busy for assistive tech, with a status text in place of the shapes.
export function SkeletonRegion({ label, className, children }: SkeletonRegionProps) {
  return (
    <div className={className} aria-busy="true">
      <span className="visually-hidden" role="status">{label}</span>
      {children}
    </div>
  );
}

// Mirrors DocumentHeader and DocumentEdit, so the loaded document does not shift.
export function DocumentDetailSkeleton({ canEdit = false }: { canEdit?: boolean }) {
  return (
    <SkeletonRegion label="Loading document…" className="doc-detail-skeleton">
      <div className="doc-pane-top-wrapper">
        <div className="doc-pane-top">
          <div className="doc-pane-title-container" />
          <div className="doc-pane-actions">
            {canEdit && <Skeleton width={72} height={36} className="skeleton-btn" />}
            <Skeleton width={36} height={36} className="skeleton-btn" />
            {canEdit && <Skeleton width={36} height={36} className="skeleton-btn" />}
            <Skeleton width={36} height={36} className="skeleton-btn" />
          </div>
        </div>
      </div>
      <div className="notion-doc-body notion-doc-body--edit">
        <div className="notion-title-input">
          <SkeletonLine width="45%" />
        </div>
        <div className="notion-properties">
          <Skeleton width={96} height={24} />
          <Skeleton width={120} height={16} />
        </div>
        {canEdit && (
          <div className="notion-att-chips">
            <Skeleton width={84} height={24} />
          </div>
        )}
        <hr className="notion-divider" />
        <div className="notion-content">
          <SkeletonLine width="100%" />
          <SkeletonLine width="100%" />
          <SkeletonLine width="80%" />
          <SkeletonLine width="100%" />
          <SkeletonLine width="90%" />
          <SkeletonLine width="40%" />
        </div>
      </div>
    </SkeletonRegion>
  );
}
