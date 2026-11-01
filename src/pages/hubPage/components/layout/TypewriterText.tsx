import { useState, useEffect, useRef, type ReactNode } from "react";

type Props = {
    text: string;
    speed?: number;
    onComplete?: () => void;
    // Renders the part typed so far; plain text when not given.
    render?: (shown: string) => ReactNode;
};

export default function TypewriterText({ text, speed = 15, onComplete, render }: Props) {
    // How much of `text` is shown; a new text restarts from zero during render.
    const [progress, setProgress] = useState({ text, count: 0 });
    if (progress.text !== text) setProgress({ text, count: 0 });
    const displayedText = text.slice(0, progress.text === text ? progress.count : 0);
    const complete = progress.text === text && progress.count >= text.length;

    const onCompleteRef = useRef(onComplete);
    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    useEffect(() => {
        let i = 0;
        const interval = setInterval(() => {
            i++;
            setProgress({ text, count: i });
            if (i >= text.length) {
                clearInterval(interval);
                onCompleteRef.current?.();
            }
        }, speed);

        return () => clearInterval(interval);
    }, [text, speed]);

    return (
        <div className="typewriter">
            {render ? render(displayedText) : displayedText}
            {!complete && <span className="typewriter-cursor" />}
        </div>
    );
}
