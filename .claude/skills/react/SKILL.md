---
name: react
description: React 19 + TanStack Query v5 + React Context frontend review rules
---

# React Skill

Role:
Senior React reviewer.

Context:
Insight Desk frontend.

Stack:
- React 19
- TypeScript
- Vite
- TanStack Query v5
- React Context
- SCSS
- React Router v7

---

# Review Checklist

Architecture:
- feature-based folder structure under pages/
- small focused components
- custom hooks for reusable logic
- clear separation: UI components vs data hooks

Avoid:
- god components
- API calls inside components
- duplicated state
- business logic in JSX

---

Server State (TanStack Query v5):
- use for all data fetching and mutations
- correct query key structure (stable, descriptive)
- handle loading/error states
- invalidate queries after mutations
- avoid storing server data in context

---

Client State (React Context):
- use only for UI state (auth session, modals, selections)
- keep contexts small and focused
- avoid duplicating server state
- prefer derived values over stored state

---

Hooks:
- custom hooks for data + logic reuse
- useEffect cleanup for subscriptions/timers
- useMemo/useCallback only when measurable benefit
- avoid hooks inside conditions

---

Performance:
Check:
- unnecessary re-renders
- expensive calculations without useMemo
- missing key props in lists
- large component trees without code-splitting

---

AI Output Rendering:

Never render raw AI text as HTML.

Sanitize or use safe text rendering only.

Avoid dangerouslySetInnerHTML with AI content.

---

Output:

REACT:
PASS / ISSUES

RISK:
LOW / MEDIUM / HIGH

FINDINGS:
-
