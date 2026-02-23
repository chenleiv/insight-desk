import { useState, useEffect } from "react";

type Props = {
    text: string;
    speed?: number;
    onComplete?: () => void;
};

export default function TypewriterText({ text, speed = 15, onComplete }: Props) {
    const [displayedText, setDisplayedText] = useState("");
    const [complete, setComplete] = useState(false);

    useEffect(() => {
        let i = 0;
        const interval = setInterval(() => {
            setDisplayedText(text.slice(0, i + 1));
            i++;
            if (i >= text.length) {
                clearInterval(interval);
                setComplete(true);
                if (onComplete) onComplete();
            }
        }, speed);

        return () => clearInterval(interval);
    }, [text, speed, onComplete]);

    return (
        <div className="typewriter">
            {displayedText}
            {!complete && <span className="typewriter-cursor" />}
        </div>
    );
}
