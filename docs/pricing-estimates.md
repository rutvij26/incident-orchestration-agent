## Pricing estimates

This guide provides rough, configurable formulas to estimate LLM and embedding costs. Replace the rates with your provider's pricing.

### Variables

- `R_in`: input token rate ($ per 1K tokens)
- `R_out`: output token rate ($ per 1K tokens)
- `R_emb`: embedding token rate ($ per 1K tokens)
- `T_in`: input tokens
- `T_out`: output tokens
- `T_emb`: embedding tokens

### Example rates (Gemini 2.5 Flash + embedding-001)

These example rates are for a basic model setup and are **not guaranteed** to be current. Verify against the official pricing page before using in production.

- `R_in = $0.0003` per 1K tokens (Gemini 2.5 Flash input; $0.30 / 1M tokens)
- `R_out = $0.0025` per 1K tokens (Gemini 2.5 Flash output; $2.50 / 1M tokens)
- `R_emb = $0.00015` per 1K tokens (embedding-001; $0.15 / 1M tokens)

### Per incident estimate

Costs per incident depend on which features are enabled:

1) **LLM enrichment (summary)**  
`cost_summary = (T_in/1000 * R_in) + (T_out/1000 * R_out)`

2) **Auto-fix proposal**  
`cost_fix = (T_in/1000 * R_in) + (T_out/1000 * R_out)`  
If a rewrite fallback is used, add one more `cost_fix`.

3) **RAG retrieval (query embedding)**  
`cost_query_embed = (T_emb/1000 * R_emb)`  
This is typically small because it embeds just the incident query.

**Total per incident**  
`cost_incident = cost_summary + cost_fix + cost_query_embed`

### Repo reindex estimate

Indexing cost is driven by total text size and chunk overlap.

1) **Approximate tokens from text**  
`T_text ≈ total_characters / 4`

2) **Overlap multiplier**  
With `RAG_CHUNK_SIZE=900` and `RAG_CHUNK_OVERLAP=150`, the multiplier is:  
`M = chunk_size / (chunk_size - overlap) = 900 / 750 ≈ 1.2`

3) **Embedding tokens**  
`T_emb ≈ T_text * M`

4) **Reindex cost**  
`cost_reindex = (T_emb/1000 * R_emb)`

### Example worksheet (using the example rates above)

- Assume `T_in=3000`, `T_out=500` for summaries  
- Assume `T_in=6000`, `T_out=800` for fixes  
- Assume `T_emb=500` for query embedding  
- Assume repo text size `50,000,000` characters  

Then:

- `T_text ≈ 12,500,000`
- `T_emb ≈ 15,000,000` (with overlap multiplier 1.2)
- `cost_reindex = 15,000,000 / 1000 * 0.00015 ≈ $2.25`

With the example rates:

- `cost_summary ≈ (3 * 0.0003) + (0.5 * 0.0025) = $0.00215`
- `cost_fix ≈ (6 * 0.0003) + (0.8 * 0.0025) = $0.0038`
- `cost_query_embed ≈ 0.5 * 0.00015 = $0.000075`
- `cost_incident ≈ $0.006025` (without rewrite fallback)

### Notes

- Reindexing only happens when the repo HEAD changes (or when you manually trigger it).
- If you disable LLM enrichment or auto-fix, per-incident costs drop accordingly.
