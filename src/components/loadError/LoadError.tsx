import "./loadError.scss";

type Props = {
  message: string;
  onRetry: () => void;
};

/** Shown in place of a list that failed to load, so a failure never looks like an empty list. */
export function LoadError({ message, onRetry }: Props) {
  return (
    <div className="load-error" role="alert">
      <p className="load-error-message">{message}</p>
      <button type="button" className="load-error-retry" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
