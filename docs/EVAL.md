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

Records are deleted automatically after 30 days by a MongoDB TTL index on `createdAt`.

### What is not collected, and why

- **No question text, no chunk text, no answer text.** Questions and documents can hold personal or confidential information, and a measurement log should not become a second copy of it.
- **No user ID, email or IP.** The metrics are about retrieval, not about people, so records cannot be tied to a user.
- The record is built field by field from IDs and scores only, and the schema rejects unknown fields. A test in `backend/__tests__/aiChat.test.js` checks that a saved record contains neither the question, the chunk text, nor the user's ID or email.
- `docId` does show which documents were used. It is kept so a low score can be traced to a document, and the 30-day TTL bounds how long it is kept.

### How to run

```
npm run eval:prod
```

It connects with `MONGODB_URI` and prints a table: number of questions, share of "no information" answers, mean top-chunk score, the number of questions that retrieved no chunk at all (for example, a user with no indexed documents), and the distribution of top-chunk scores (`< 0.3`, `0.3 - 0.4`, `0.4 - 0.5`, `0.5 - 0.6`, `>= 0.6`). The calculation is in `backend/rag/retrievalStats.js`.

### What these metrics can and cannot tell

They can:

- Show drift over time: a falling mean top score, or a rising share of "no information", after a change to chunking, the embedding model or the documents.
- Help tune `MIN_SIMILARITY`: many top scores just under 0.3 suggest the threshold may be cutting answerable questions.
- Show how often users ask about things their documents do not cover.

They cannot:

- Say whether the retrieved chunk was the right one. A high score means "similar", not "correct"; hit@k still needs labeled questions (`npm run eval`).
- Say whether the model's answer was correct or helpful. Only retrieval is logged.
- Tell a good "no information" (the answer really is not in the documents) from a bad one (retrieval missed it).
- Compare across settings reliably: scores depend on the embedding model and the questions asked, and `chunkSize` is the value in the code, not necessarily the size the stored chunks were built with if `npm run reindex` has not been run since.
- Represent many users yet: with demo traffic, counts are small and a few visitors can swing every number.
