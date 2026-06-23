# Paper Mining Project

Open-access scientific paper mining pipeline for schema-based LLM-RAG extraction.

The project searches open-access papers from legal sources, downloads public PDFs only, extracts text, builds a local vector database, retrieves relevant chunks, and uses an OpenAI model to extract structured data into CSV, JSONL, and Excel workbooks.

## What It Does

- Searches papers with OpenAlex.
- Resolves open-access PDF URLs with Unpaywall and OpenAlex metadata.
- Downloads only public/open-access PDFs.
- Extracts page-level text from PDFs with PyMuPDF.
- Cleans text and creates chunks.
- Stores chunks in ChromaDB with OpenAI embeddings.
- Retrieves chunks by schema field description.
- Extracts structured JSON with an OpenAI model.
- Exports results as CSV, JSONL, and, for record-level schemas, a grouped-header Excel workbook.
- Tracks OpenAI token usage in `token_usage.csv` and `token_usage.json`.

## Repository Layout

```text
paper_mining_project/
  main.py
  requirements.txt
  .env.example
  .gitignore
  configs/
    settings.yaml
    extraction_schema.yaml
    carbide_mechanical_schema.yaml
    search_query.yaml
  data/
    papers/.gitkeep
    texts/.gitkeep
    chunks/.gitkeep
    vector_db/.gitkeep
    outputs/.gitkeep
  src/
    paper_search.py
    oa_checker.py
    pdf_downloader.py
    pdf_parser.py
    text_cleaner.py
    chunker.py
    vector_store.py
    retriever.py
    extractor.py
    validator.py
    exporter.py
    usage_tracker.py
    logger.py
```

## Install

```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

## Environment

Copy `.env.example` to `.env` and add your keys.

```text
OPENAI_API_KEY=your_openai_api_key_here
UNPAYWALL_EMAIL=your_email@example.com
OPENALEX_MAILTO=your_email@example.com
```

`.env` is ignored by git.

## Basic Run

```powershell
python main.py --topic "high entropy carbide elastic modulus machine learning" --max_papers 30
```

## Carbide Mechanical Properties Run

Use the record-level carbide schema when you want one row per material/sample/condition instead of one row per paper.

```powershell
python main.py `
  --topic "transition metal carbide tungsten carbide silicon carbide boron carbide mechanical properties hardness elastic modulus fracture toughness" `
  --max_papers 10 `
  --schema configs/carbide_mechanical_schema.yaml `
  --require_terms "carbide" `
  --exclude_terms "high entropy,high-entropy,alloy,alloys,glass,glasses,machine learning,deep learning,neural network,artificial intelligence,materials informatics"
```

## Configuration

Edit `configs/settings.yaml` to change models and runtime parameters.

```yaml
openai_model: "gpt-5-nano"
embedding_model: "text-embedding-3-small"
chunk_size: 2000
chunk_overlap: 200
top_k: 5
max_papers: 30
temperature: 0
output_dir: "data/outputs"
```

To switch from `gpt-5-nano` to `gpt-5-mini`, change only `openai_model`.

## Schemas

`configs/extraction_schema.yaml` is a generic paper-level schema.

`configs/carbide_mechanical_schema.yaml` is a record-level schema for carbide mechanical property databases. It produces rows with groups such as:

- Meta data
- Material
- Processing / Sample
- Mechanical Property
- Notes

Record-level output is designed to be spreadsheet-friendly. For example, a single paper can produce several rows such as `ZrB2`, `ZrB2-SiC`, and `ZrB2-30SiC`, each with matching hardness, modulus, toughness, and processing fields.

## Outputs

Generated outputs are written under `data/outputs` by default and are ignored by git.

- `metadata.csv`: searched paper metadata
- `extracted_database.jsonl`: raw extraction results
- `extracted_database.csv`: flattened table
- `extracted_database.xlsx`: grouped-header Excel database for record-level schemas
- `skipped_papers.csv`: skipped papers and reasons
- `run_log.txt`: run log
- `token_usage.csv`: OpenAI token usage summary
- `token_usage.json`: OpenAI token usage summary as JSON

## GitHub Notes

The repository intentionally excludes:

- `.env`
- `.venv`
- downloaded PDFs
- extracted text
- chunks
- ChromaDB vector database files
- generated CSV/XLSX/JSONL/log outputs

The `data/*/.gitkeep` files preserve the expected folder structure without committing generated artifacts.

## Legal And Access Notes

This project uses public APIs and public open-access PDF URLs only. It does not use Sci-Hub or other unofficial download paths. Paid or access-restricted PDFs are skipped.

## Limitations

- Some publisher PDF links may return 403 responses.
- Some papers have open-access landing pages but no direct PDF URL.
- LLM JSON can occasionally be malformed; adding a JSON repair or strict structured output layer is recommended for higher recall.
- Table-heavy papers may benefit from a stronger model such as `gpt-5-mini`.

