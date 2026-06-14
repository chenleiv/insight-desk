import { useState, useEffect, useRef } from "react";

type Props = {
    text: string;
    speed?: number;
    onComplete?: () => void;
};

export default function TypewriterText({ text, speed = 15, onComplete }: Props) {
    const [displayedText, setDisplayedText] = useState("");
    const [complete, setComplete] = useState(false);
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;

    useEffect(() => {
        let i = 0;
        setDisplayedText("");
        setComplete(false);
        const interval = setInterval(() => {
            setDisplayedText(text.slice(0, i + 1));
            i++;
            if (i >= text.length) {
                clearInterval(interval);
                setComplete(true);
                onCompleteRef.current?.();
            }
        }, speed);

        return () => clearInterval(interval);
    }, [text, speed]);

    return (
        <div className="typewriter">
            {displayedText}
            {!complete && <span className="typewriter-cursor" />}
        </div>
    );
}
