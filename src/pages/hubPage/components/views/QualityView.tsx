import "./quality.scss";
import { useState } from "react";
import type { FeedbackCounts, QualityDays } from "../../../../api/aiClient";
import { useQualitySummary } from "../../hooks/useQualitySummary";

const RANGES: QualityDays[] = [7, 30];

const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : "-");

// The same metrics as `npm run eval:prod`, for admins and demo visitors.
export default function QualityView({ isDemo }: { isDemo: boolean }) {
  const [days, setDays] = useState<QualityDays>(7);
  const { data, isLoading, error } = useQualitySummary(days);

  const scored = data ? data.questions - data.noResults : 0;
  const maxBucket = data ? Math.max(1, ...data.buckets.map((b) => b.count)) : 1;
  const feedbackRows: [string, FeedbackCounts][] = data
    ? [
        ["Regular answers", data.feedback.regular],
        ['"No information" answers', data.feedback.noInfo],
        ["All", data.feedback.all],
      ]
    : [];

  return (
    <div className="quality-view">
      <div className="quality-panel">
        <div className="quality-header">
          <div>
            <h2>Answer Quality</h2>
            <p>Retrieval and feedback metrics from chat questions. Aggregates only, no questions or users.</p>
            {isDemo && (
              <p className="quality-demo-note">
                Live metrics from all chat questions, including the ones you ask in this demo.
              </p>
            )}
          </div>
          <div className="quality-range" role="group" aria-label="Time range">
            {RANGES.map((d) => (
              <button
                key={d}
                type="button"
                className={`quality-range-btn ${days === d ? "active" : ""}`}
                aria-pressed={days === d}
                onClick={() => setDays(d)}
              >
                {d} days
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="quality-status">Loading metrics…</div>
        ) : error || !data ? (
          <div className="quality-status">Could not load metrics: {error?.message ?? "no data"}</div>
        ) : (
          <div className="quality-body">
            <div className="quality-cards">
              <div className="quality-card">
                <span className="quality-card-label">Questions</span>
                <span className="quality-card-value">{data.questions}</span>
              </div>
              <div className="quality-card">
                <span className="quality-card-label">"No information"</span>
                <span className="quality-card-value">{pct(data.noInfo, data.questions)}</span>
                <span className="quality-card-note">{data.noInfo} answers</span>
              </div>
              <div className="quality-card">
                <span className="quality-card-label">Mean top-chunk score</span>
                <span className="quality-card-value">
                  {data.meanTopScore === null ? "-" : data.meanTopScore.toFixed(3)}
                </span>
                <span className="quality-card-note">{data.noResults} with no chunks</span>
              </div>
              <div className="quality-card">
                <span className="quality-card-label">Rated helpful</span>
                <span className="quality-card-value">{pct(data.feedback.all.up, data.feedback.all.rated)}</span>
                <span className="quality-card-note">of {data.feedback.all.rated} rated</span>
              </div>
            </div>

            <section>
              <h3 className="quality-heading">Top-chunk score distribution</h3>
              <ul className="quality-bars">
                {data.buckets.map((b) => (
                  <li key={b.label} className="quality-bar-row">
                    <span className="quality-bar-label">{b.label}</span>
                    <span className="quality-bar-track" aria-hidden="true">
                      <span className="quality-bar-fill" style={{ width: `${(b.count / maxBucket) * 100}%` }} />
                    </span>
                    <span className="quality-bar-value">
                      {b.count} ({pct(b.count, scored)})
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="quality-heading">Feedback</h3>
              <div className="quality-table-scroll">
                <table className="quality-table">
                  <thead>
                    <tr>
                      <th scope="col">Answers</th>
                      <th scope="col">Total</th>
                      <th scope="col">Rated</th>
                      <th scope="col">Up</th>
                      <th scope="col">Down</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedbackRows.map(([label, f]) => (
                      <tr key={label}>
                        <th scope="row">{label}</th>
                        <td>{f.answers}</td>
                        <td>{f.rated} ({pct(f.rated, f.answers)})</td>
                        <td>{pct(f.up, f.rated)}</td>
                        <td>{pct(f.down, f.rated)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="quality-note">Up and down are shares of rated answers. Small numbers swing easily.</p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
