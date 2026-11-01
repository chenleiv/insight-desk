import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderMarkdown } from "../renderMarkdown";

const html = (text: string) => renderToStaticMarkup(<>{renderMarkdown(text)}</>);

// Generous next to linear time; a quadratic pass over 100000 characters takes far longer.
const BUDGET_MS = 1000;

function expectFast(text: string) {
  const start = performance.now();
  html(text);
  expect(performance.now() - start).toBeLessThan(BUDGET_MS);
}

describe("renderMarkdown", () => {
  it("returns a plain text answer unchanged", () => {
    const text = "Employees get 20 days.\n\nBook early [Vacation Policy], 2 * 3 = 6.";
    expect(renderMarkdown(text)).toBe(text);
  });

  it("renders bold, italic and inline code as elements", () => {
    expect(html("A **bold** and *italic* word with `npm test`.")).toBe(
      "A <strong>bold</strong> and <em>italic</em> word with <code>npm test</code>."
    );
  });

  it("renders bullet and numbered lists", () => {
    expect(html("Steps:\n- one\n- **two**")).toBe("Steps:<ul><li>one</li><li><strong>two</strong></li></ul>");
    expect(html("3. third\n4. fourth")).toBe('<ol start="3"><li>third</li><li>fourth</li></ol>');
  });

  it("renders a fenced code block with its content as text", () => {
    expect(html("Run:\n```js\nconst a = **b**;\n```\nDone.")).toBe(
      "Run:<pre><code>const a = **b**;</code></pre>Done."
    );
  });

  it("shows raw HTML as text, never as elements", () => {
    const out = html('<script>alert(1)</script> <img src=x onerror="alert(1)"> **hi**');
    expect(out).not.toMatch(/<script|<img/);
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out).toContain("&lt;img src=x onerror=");
  });

  it("never renders links, whatever their scheme", () => {
    for (const text of [
      "[click](javascript:alert(1))",
      "[click](data:text/html,<script>alert(1)</script>)",
      "[click](https://example.com)",
      "<https://example.com>",
      "[click]\n\n[click]: javascript:alert(1)",
    ]) {
      expect(html(text)).not.toContain("<a");
    }
  });

  it("never renders images", () => {
    expect(html("![pixel](https://tracker.example/p.png)\n- ![x](data:image/png;base64,AAAA)")).not.toContain("<img");
  });

  it("keeps a citation title in brackets as plain text", () => {
    expect(renderMarkdown("Use PKCE [OAuth 2.0 Authorization Flows].")).toBe(
      "Use PKCE [OAuth 2.0 Authorization Flows]."
    );
    expect(renderMarkdown("Use PKCE [OAuth 2.0 Authorization Flows](https://evil.example).")).toBe(
      "Use PKCE [OAuth 2.0 Authorization Flows](https://evil.example)."
    );
    expect(html("- PKCE [OAuth 2.0 Authorization Flows]\n\n[OAuth 2.0 Authorization Flows]: https://evil.example")).toBe(
      "<ul><li>PKCE [OAuth 2.0 Authorization Flows]</li></ul>[OAuth 2.0 Authorization Flows]: https://evil.example"
    );
  });

  it("shows unclosed markers and an unclosed code block as plain text", () => {
    for (const text of ["Use **bold", "Run `npm", "An *italic", "Run:\n```js\nconst a = 1;"]) {
      expect(renderMarkdown(text)).toBe(text);
    }
  });

  it("renders every prefix of an answer while it is typed", () => {
    const answer = "Steps:\n1. Run `npm test`.\n2. Check **all *three* parts**.\n```sh\nnpm run build\n```\nDone.";
    for (let i = 0; i <= answer.length; i++) {
      expect(() => html(answer.slice(0, i))).not.toThrow();
    }
  });
});

describe("renderMarkdown on adversarial input", () => {
  it("handles 100000 asterisks", () => expectFast("*".repeat(100_000)));

  it("handles 100000 backticks", () => expectFast("`".repeat(100_000)));

  it("handles thousands of unclosed bold markers", () => expectFast("**a ".repeat(20_000)));

  it("handles thousands of unclosed italic and code markers", () => expectFast("*a `b ".repeat(20_000)));

  it("handles a very long list", () => expectFast("- item **x**\n".repeat(20_000)));

  it("handles deeply repeated brackets", () => {
    expectFast("[".repeat(50_000) + "]".repeat(50_000));
    expectFast("[a](".repeat(25_000));
  });

  it("handles an unclosed code fence before a long text", () => expectFast("```\n" + "text\n".repeat(50_000)));

  it("handles an odd number of fences, the last one unclosed", () => expectFast("```\n".repeat(20_001)));

  it("handles many fences and long blank runs", () => {
    expectFast("```js\nx\n```\n".repeat(10_000));
    expectFast(" ".repeat(100_000) + "-");
  });
});
