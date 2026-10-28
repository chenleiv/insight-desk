# Retrieval evaluation

How chunk size was chosen for RAG retrieval, and what to measure next.

## What was tested

- **Question:** does retrieval rank a chunk of the right document first?
- **Data:** the 14 demo documents in `backend/demo/sample-documents.json` and 20 questions in `eval/questions.json`, each with an `expectedDoc`. Question types: 8 fact, 9 paraphrase, 3 long-document (start, middle, end of the employee handbook).
- **Method:** `eval/run.js` chunks every document with the production chunker, embeds chunks and questions with the same local model the server uses (`Xenova/all-MiniLM-L6-v2`), and ranks chunks by cosine similarity. It runs offline: no database, no Groq calls.
- **Metrics:** hit@1 (a chunk of the expected document is ranked first) and hit@3 (one is in the top 3). Both are measured at the document level, not the chunk level.
- **Configurations:** chunk sizes 300, 600 and 1000 characters with 20% overlap, plus the production setting at the time (800 / 150).

Rerun with `npm run eval`. The table is written to `eval/chunk-size-results.md`.

## Results

| chunk size | overlap | chunks | hit@1 | hit@3 | missed at 1 |
|---|---|---|---|---|---|
| 300 | 60 | 140 | 19/20 (95%) | 20/20 (100%) | q19 |
| **600** | **120** | **72** | **20/20 (100%)** | **20/20 (100%)** | none |
| 800 (previous default) | 150 | 52 | 19/20 (95%) | 20/20 (100%) | q19 |
| 1000 | 200 | 43 | 19/20 (95%) | 20/20 (100%) | q19 |

Every configuration finds the right document in the top 3. The only difference is q19, *"My laptop looks hacked. Should I reboot it before telling anyone?"* (expected: Security Incident Response). Small chunks rank the password document first; large chunks rank the employee handbook first.

## Decision

The default is now **600 characters with 120 overlap** (`CHUNK_SIZE` and `CHUNK_OVERLAP` in `backend/rag/buildChunks.js`). It is the only setting with a perfect hit@1, and it produces fewer chunks than 300, so it embeds and searches less. `backend/demo/sample-embeddings.json` was regenerated with `npm run embed:demo` to match.

After this change, the "(current)" row of `npm run eval` is 600 / 120, so the 800 / 150 row above is kept here as the record of the previous default.

## Limits of this result

- The margin is one question out of 20. This is weak evidence: it shows 600 is not worse, not that it is clearly better. The test is close to its ceiling and barely separates the sizes.
- The 14 demo documents cover very different topics, so picking the right document is easier than in a workspace of similar documents.
- The questions were written after reading the documents, so they tend to reuse the documents' wording.
- The demo documents have no attachments, so attachment chunking is not covered.
- Only retrieval is measured. Whether Groq answers correctly from the retrieved chunks is not.

## Existing documents

Documents already stored in MongoDB keep the chunks and embeddings built with the old setting until they are rebuilt. After changing `CHUNK_SIZE` or `CHUNK_OVERLAP`, run `npm run reindex -- --dry-run` to see the new chunk counts, then `npm run reindex` to rebuild every document's chunks and embeddings.

## What to improve next

1. **More questions**, especially paraphrases and questions that span two documents, so a one-question difference stops deciding the result.
2. **Harder documents**: several documents on similar topics, and documents with attachments.
3. **Questions written without reading the documents** (or taken from real usage), so they do not copy the documents' wording.
4. **Not-in-docs questions** with a similarity threshold, to measure whether retrieval returns nothing when it should.
5. **Answer quality**, not only retrieval: send the top chunks to the model and score the answer against `expected`.
6. **Chunk-level hits** (the chunk that holds the answer, not just the right document) and MRR, for a finer signal.

## Measuring in production

In production there is no known "right document" for a question, so hit@k cannot be computed. Instead, every chat question leaves a small record of what retrieval found, and a script summarizes those records as indirect quality signals.

### What is collected

`POST /api/ai/chat` saves one `RetrievalLog` record per question (`backend/rag/retrievalLog.js`):

- `createdAt`: when the question was asked.
- `results`: every chunk the search returned (up to 5), best first, *before* the similarity threshold: its `docId`, chunk `index` and similarity `score`.
- `noInfo`: true when no chunk reached the threshold, so the answer was "no information" and the model was not called.
- `chunkSize` and `minSimilarity`: the settings in the code at the time.
- `feedback`: the user's rating of the answer, `up`, `down` or `null` (not rated). See [User feedback](#user-feedback).
- `ownerTag`: an HMAC-SHA256 of the asking user's ID and the record's ID, keyed with the server secret (`JWT_SECRET`). It only lets the server check that a feedback request comes from the user who asked.

Records are deleted automatically after 30 days by a MongoDB TTL index on `createdAt`.

### What is not collected, and why

- **No question text, no chunk text, no answer text.** Questions and documents can hold personal or confidential information, and a measurement log should not become a second copy of it.
- **No user ID, email or IP.** The metrics are about retrieval, not about people, so records cannot be tied to a user. `ownerTag` cannot be reversed, and without the server secret it cannot be recomputed for a known user. Because it includes the record's ID, two records of the same user do not share a tag, so records cannot be grouped by user either.
- The record is built field by field from IDs and scores only, and the schema rejects unknown fields. A test in `backend/__tests__/aiChat.test.js` checks that a saved record contains neither the question, the chunk text, nor the user's ID or email.
- `docId` does show which documents were used. It is kept so a low score can be traced to a document, and the 30-day TTL bounds how long it is kept.

### How to run

```
npm run eval:prod
```

By default it covers the last 30 days (all records, given the TTL). For another range:

```
npm run eval:prod -- --days 7
```

It connects with `MONGODB_URI` and first prints the database host and name it read from (never credentials), so it is clear whether the numbers come from development or production. Then it prints a table: number of questions, share of "no information" answers, mean top-chunk score, the number of questions that retrieved no chunk at all (for example, a user with no indexed documents), and the distribution of top-chunk scores (`< 0.3`, `0.3 - 0.4`, `0.4 - 0.5`, `0.5 - 0.6`, `>= 0.6`). A second table shows feedback for regular answers, "no information" answers and all answers: the number of answers, how many were rated, and the share of `up` and `down` among the rated ones. The calculation is in `backend/rag/retrievalStats.js`: `getRetrievalSummary({ days })` loads the records of the range and summarizes them, and both the script and the quality dashboard call it.

### Quality dashboard

The same metrics are shown in the app, so they can be read without running the script.

- **Where:** the **Quality** button in the top bar, next to Dashboard and Settings (in the side menu on mobile). It opens its own view at `/hub?view=quality`. It has number cards (questions, share of "no information", mean top-chunk score, share rated helpful), a bar chart of the top-score distribution, and the feedback table. A switch picks the last 7 or 30 days.
- **Who:** users with the `admin` role and demo visitors, so the dashboard can be shown in the public demo. `viewer` users do not see the button (a direct link sends them back to the chat), and the server enforces it: `GET /api/ai/quality?days=7|30` returns 403 to viewers and 401 to requests without a session. Any other `days` value returns 400.
- **Why demo visitors may see it:** the response holds aggregates only, so a visitor learns nothing about other users' questions, documents or identity. What it does reveal is how much the chat is used (for example, the number of questions in the last week). The numbers are real, and a visitor's own questions are counted in them.
- **Protection:** anyone can open a demo session, so the endpoint is rate limited to 30 requests per minute per client.
- **What it returns:** only the aggregate summary (counts, mean score, buckets and feedback counts) plus `days`. No records, document IDs, owner tags, timestamps or user data. Tests in `backend/__tests__/aiChat.test.js` check the 403 for viewers, that demo users get the same aggregates as admins, the rate limit, that the response holds only these fields, and that it equals what `getRetrievalSummary` returns for the script.
- **Which data:** the dashboard reads the database its server is connected to. On the deployed site that is the production database; on a local server it is the development one. To compare the script with the dashboard, run both against the same database: the script's first line shows which one it read.
- The range is counted back from the moment of the request, so two readings a few minutes apart can differ by a record at the edge of the range.

### What these metrics can and cannot tell

They can:

- Show drift over time: a falling mean top score, or a rising share of "no information", after a change to chunking, the embedding model or the documents.
- Help tune `MIN_SIMILARITY`: many top scores just under 0.3 suggest the threshold may be cutting answerable questions.
- Show how often users ask about things their documents do not cover.

They cannot:

- Say whether the retrieved chunk was the right one. A high score means "similar", not "correct"; hit@k still needs labeled questions (`npm run eval`).
- Say whether the model's answer was correct. Only retrieval is logged; user feedback (below) is the only signal about the answer itself.
- Tell a good "no information" (the answer really is not in the documents) from a bad one (retrieval missed it).
- Compare across settings reliably: scores depend on the embedding model and the questions asked, and `chunkSize` is the value in the code, not necessarily the size the stored chunks were built with if `npm run reindex` has not been run since.
- Represent many users yet: with demo traffic, counts are small and a few visitors can swing every number.

### User feedback

Every assistant answer in the chat has two buttons, thumbs up and thumbs down. They are the only direct signal of whether an answer helped.

- `POST /api/ai/chat` returns an `answerId`: the ID of the question's `RetrievalLog` record. It is `null` if the record could not be saved, and then no buttons are shown.
- `POST /api/ai/feedback` takes `{ answerId, rating }`, where `rating` is `up` or `down`. It sets `feedback` on that record. A new rating replaces the old one, so each answer has at most one.
- Only the signed-in user who asked can rate the answer: the server recomputes `ownerTag` from the signed-in user and the record ID. Another user's answer, an expired one and an unknown ID all return 404, so the response does not reveal whether a record exists.
- The body is validated with zod and any other field is rejected, so feedback holds no free text. Requests are rate limited to 30 per minute per client. Demo users need no extra limit: feedback only updates a field on an existing record, and records are already bounded by the chat rate limit.
- Tests in `backend/__tests__/aiChat.test.js` cover saving and replacing a rating, rating another user's answer, invalid values, extra fields, and requests without a session.

#### What feedback can and cannot tell

It can:

- Show whether users find answers helpful, and whether that changes after a change to the prompt, the model, chunking or the threshold.
- Compare regular answers with "no information" answers. Many `down` ratings on "no information" suggest the threshold or retrieval misses answerable questions. Many `down` ratings on regular answers point at the answer itself: wrong chunks, or the model using them badly.

It cannot:

- Say whether an answer was correct. A user may like a wrong answer that sounds confident, or dislike a correct answer they did not want to hear.
- Represent all answers. Only some users rate, and people tend to rate when something goes wrong, so the share of `down` is likely higher than among all answers. Read the `rated` column before reading the percentages.
- Say why an answer was rated `down`. There is no free text by design, and the question and answer are not stored.
- Be read on small numbers. With demo traffic, a few ratings can swing every percentage.
- Survive the record: feedback is deleted with its record after 30 days, and answers in a chat from before this change have no `answerId` and cannot be rated.
