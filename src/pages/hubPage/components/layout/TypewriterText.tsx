import { useState, useEffect, useRef, type ReactNode } from "react";

type Props = {
    text: string;
    // Milliseconds between screen updates. Each update parses the whole text typed so far.
    speed?: number;
    onComplete?: () => void;
    // Renders the part typed so far; plain text when not given.
    render?: (shown: string) => ReactNode;
};

// The pace of short answers, and the longest any answer takes, however long it is.
const MS_PER_CHARACTER = 15;
const MAX_TYPING_MS = 4000;

function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// By the time passed, not by updates made: a background tab slows timers, and the limit still holds.
function charactersAfter(text: string, elapsedMs: number, speed: number) {
    const updates = Math.floor(MAX_TYPING_MS / speed);
    const perUpdate = Math.max(Math.ceil(speed / MS_PER_CHARACTER), Math.ceil(text.length / updates));
    const count = Math.min(Math.floor(elapsedMs / speed) * perUpdate, text.length);
    // Never cuts an emoji in half: its second half comes along with the first.
    const code = text.charCodeAt(count - 1);
    return code >= 0xd800 && code <= 0xdbff ? count + 1 : count;
}

export default function TypewriterText({ text, speed = 30, onComplete, render }: Props) {
    const instant = prefersReducedMotion();

    // How much of `text` is shown; a new text restarts from zero during render.
    const [progress, setProgress] = useState({ text, count: 0 });
    if (progress.text !== text) setProgress({ text, count: 0 });
    const displayedText = instant ? text : text.slice(0, progress.text === text ? progress.count : 0);
    const complete = instant || (progress.text === text && progress.count >= text.length);

    const onCompleteRef = useRef(onComplete);
    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    useEffect(() => {
        if (instant) {
            onCompleteRef.current?.();
            return;
        }
        const start = Date.now();
        const interval = setInterval(() => {
            const count = charactersAfter(text, Date.now() - start, speed);
            setProgress({ text, count });
            if (count >= text.length) {
                clearInterval(interval);
                onCompleteRef.current?.();
            }
        }, speed);

        return () => clearInterval(interval);
    }, [text, speed, instant]);

    return (
        <div className="typewriter">
            {render ? render(displayedText) : displayedText}
            {!complete && <span className="typewriter-cursor" />}
        </div>
    );
}
