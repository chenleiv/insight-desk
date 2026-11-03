import { useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import Menu from "../../../../../components/menu/Menu";

type Props = {
  onOpenPrompt: () => void;
  // Left out until the chat has started: there is nothing to clear yet.
  onClearChat: (() => void) | undefined;
};

// Phones only. Takes the place of the row under the input, which costs too much height there.
export function ChatActionsMenu({ onOpenPrompt, onClearChat }: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  // The menu closes itself on pointer down, so without this a second tap would reopen it.
  const closingRef = useRef(false);

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className="ai-chat-actions-btn"
        // Taking focus would close the keyboard.
        onMouseDown={(e) => e.preventDefault()}
        onPointerDown={() => { closingRef.current = open; }}
        onClick={() => {
          if (!closingRef.current) setOpen(true);
          closingRef.current = false;
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Chat actions"
      >
        <MoreVertical size={18} aria-hidden />
      </button>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={btnRef}
        placement="above"
        items={[
          { label: "System Prompt", onClick: onOpenPrompt },
          ...(onClearChat ? [{ label: "Clear chat", danger: true, onClick: onClearChat }] : []),
        ]}
      />
    </>
  );
}
