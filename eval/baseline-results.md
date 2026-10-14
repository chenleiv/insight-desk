# Baseline results, 2026-10-13

Measured by hand on branch `rag-update`, before any RAG changes. Questions are defined in `questions.json`.

## System under test

- **Retrieval:** client-side keyword scoring (`scoreDoc` in `src/pages/hubPage/utils/assistantUtils.ts`). The top 3 whole documents are sent as context, about 22,900 characters for 3 documents.
- **Model:** `openai/gpt-oss-20b` via Groq, temperature 0.3, max_tokens 300.
- **Prompt:** the system prompt can be overridden from the Settings view and is loaded from the database at startup. As far as could be determined, this baseline used the default text (`DEFAULT_PROMPT`, v1.0) from `backend/prompts.js`.

## Results

| id | type | question | expected | result | notes |
|---|---|---|---|---|---|
| q01 | fact | Which severity level covers ransomware, and who is it escalated to? | P1 (Critical); escalated to CISO, Legal, CEO | correct | Answer comes from the attachment of the Security Incident Response document. |
| q02 | not-in-docs | What is the phone number of the security team? | Exact refusal sentence from `backend/prompts.js` | correct | |
| q03 | long-doc-start | When is the IT help desk open? | Sunday to Thursday, 08:00 to 18:00 | correct | |
| q04 | long-doc-middle | How far in advance must remote work days be requested? | At least five working days | correct | |
| q05 | long-doc-end | When is the backup power generator tested? | Every second Tuesday of the month at 06:30 | correct | |
| q06 | paraphrase | How early do I need to ask to work from home? | At least five working days | failed | The assistant said it could not find the information. Cause not yet confirmed. The query shares the word "work" with the handbook, so either the handbook was not among the top 3 documents selected by `scoreDoc`, or the model refused for another reason. To be verified by checking which documents were sent. |

## Summary

5 of 6 correct. One open failure (q06), pending a root-cause check.

## How to rerun

1. Upload the handbook and the Security Incident Response document (with its attachment).
2. Ask each question from `questions.json` in the Hub assistant.
3. Record the results in a new dated file next to this one.
