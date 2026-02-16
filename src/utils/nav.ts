export const getNavLinkClass = (
  { isActive }: { isActive: boolean },
  baseClass: string,
) => `${baseClass}${isActive ? " is-active" : ""}`;
