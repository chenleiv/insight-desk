import { useRef, useState } from "react";
import Menu from "../../../components/menu/Menu";

type Props = {
  onImport: (mode: "merge" | "replace") => void;
  ref?: React.RefObject<HTMLButtonElement>;
};

export default function ImportMenuButton({ onImport }: Props) {
  const [open, setOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div className="menu-wrap" onClick={(e) => e.stopPropagation()}>
      <button
        ref={menuBtnRef}
        className="text-btn"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Import
      </button>

      <Menu
        anchorRef={menuBtnRef as React.RefObject<HTMLElement>}
        open={open}
        onClose={() => setOpen(false)}
        align="right"
        items={[
          { label: "Import (Merge)", onClick: () => onImport("merge") },
          {
            label: "Import (Replace)",
            danger: true,
            onClick: () => onImport("replace"),
          },
        ]}
      />
    </div>
  );
}
