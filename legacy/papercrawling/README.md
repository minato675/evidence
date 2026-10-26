# Paper Mining Project

오픈액세스 논문을 자동으로 검색하고, 공개 PDF만 다운로드한 뒤, 사용자가 정의한 schema에 맞춰 LLM-RAG 기반 구조화 데이터를 추출하는 Python 파이프라인입니다.

특히 탄화물 기계적 물성 데이터베이스처럼 **논문 1개를 1행으로 요약하는 방식이 아니라, 조성/샘플/실험조건별 데이터 포인트를 1행으로 정리하는 Excel DB 출력**을 지원합니다.

## 주요 기능

- OpenAlex 기반 논문 검색
- Unpaywall/OpenAlex 기반 open-access PDF URL 확인
- 공개 PDF만 다운로드
- PyMuPDF 기반 PDF 텍스트 추출
- 텍스트 정리 및 chunk 생성
- OpenAI embedding + ChromaDB 기반 로컬 vector DB 생성
- schema field 설명을 query로 사용한 관련 chunk 검색
- OpenAI 모델을 이용한 JSON 구조화 추출
- CSV, JSONL, Excel 출력
- OpenAI token 사용량 기록
- 다운로드/파싱/API/JSON 오류 및 skip 사유 기록
- 모든 chunk에 원본 PDF 페이지 범위 유지
- LLM이 인용한 chunk와 evidence text의 원문 일치 여부 검증
- CSV/Excel에 source chunk, page, confidence, validation status 보존

## 폴더 구조

```text
paper_mining_project/
  main.py
  requirements.txt
  .env.example
  .gitignore
  README.md
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

## 설치 방법

```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

## 환경 변수 설정

`.env.example`을 `.env`로 복사한 뒤 API 키와 이메일을 입력합니다.

```text
OPENAI_API_KEY=your_openai_api_key_here
UNPAYWALL_EMAIL=your_email@example.com
OPENALEX_MAILTO=your_email@example.com
```

`OPENAI_API_KEY`는 필수입니다.  
`UNPAYWALL_EMAIL`, `OPENALEX_MAILTO`는 API 사용 예절과 연락 가능성을 위해 넣는 것을 권장합니다.

`.env` 파일은 `.gitignore`에 포함되어 GitHub에 올라가지 않습니다.

## 기본 실행

```powershell
python main.py --topic "high entropy carbide elastic modulus machine learning" --max_papers 30
```

주요 옵션:

- `--topic`: 검색할 연구 주제
- `--max_papers`: 최대 검색 논문 수
- `--schema`: 추출 schema 경로
- `--settings`: 설정 파일 경로
- `--require_terms`: 제목/초록에 반드시 포함되어야 하는 단어 목록
- `--exclude_terms`: 제목/초록에 포함되면 제외할 단어 목록

## 탄화물 기계적 물성 DB 생성 예시

탄화물 기계적 물성처럼 조성/샘플/조건별 row가 필요한 경우에는 `configs/carbide_mechanical_schema.yaml`을 사용합니다.

```powershell
python main.py `
  --topic "transition metal carbide tungsten carbide silicon carbide boron carbide mechanical properties hardness elastic modulus fracture toughness" `
  --max_papers 10 `
  --schema configs/carbide_mechanical_schema.yaml `
  --require_terms "carbide" `
  --exclude_terms "high entropy,high-entropy,alloy,alloys,glass,glasses,machine learning,deep learning,neural network,artificial intelligence,materials informatics"
```

이 schema를 사용하면 한 논문에서 여러 조성이나 샘플이 보고된 경우 각각 별도 행으로 분리됩니다.

예시 출력 구조:

```text
Meta data
  Title, Year, DOI

Material
  Material system, Composition, Phase, Binder or second phase

Processing / Sample
  Density, Grain size, Synthesis method, Sintering temperature, Sintering time

Mechanical Property
  Test method, Test temperature, Bulk modulus, Shear modulus,
  Youngs modulus, Hardness, Fracture toughness, Flexural strength,
  Compressive strength, Poisson ratio

Notes
  Notes
```

## 설정 파일

기본 설정은 `configs/settings.yaml`에서 수정합니다.

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

모델을 바꾸려면 `openai_model` 값만 수정하면 됩니다.

예:

```yaml
openai_model: "gpt-5-mini"
```

## Schema 수정 방법

`configs/extraction_schema.yaml` 또는 `configs/carbide_mechanical_schema.yaml`의 `fields` 항목을 수정하면 코드 변경 없이 추출 항목을 바꿀 수 있습니다.

예시:

```yaml
fields:
  - name: hardness
    group: "Mechanical Property"
    description: "Hardness value for this exact material/sample/condition"
    type: "number"
    unit: "GPa"
    required: false
    allow_multiple: false
```

field 속성:

- `name`: 내부 필드명
- `group`: Excel 출력 시 상위 그룹명
- `description`: retrieval query 및 LLM 추출 지침에 사용되는 설명
- `type`: `string`, `number` 등
- `unit`: 단위
- `required`: 필수 여부
- `allow_multiple`: 여러 값 허용 여부

## 출력 파일

기본 출력 위치는 `data/outputs`입니다.

- `metadata.csv`: 검색된 논문 metadata
- `extracted_database.jsonl`: 원본 JSON 추출 결과
- `extracted_database.csv`: flatten된 표
- `extracted_database.xlsx`: 2단 그룹 헤더가 있는 Excel DB
- `skipped_papers.csv`: skip된 논문과 사유
- `run_log.txt`: 실행 로그
- `token_usage.csv`: OpenAI token 사용량 요약
- `token_usage.json`: OpenAI token 사용량 JSON

## GitHub 업로드 시 제외되는 파일

다음 파일과 폴더는 `.gitignore`에 의해 GitHub에 올라가지 않습니다.

- `.env`
- `.venv`
- 다운로드된 PDF
- 추출된 텍스트
- chunk JSONL
- ChromaDB vector DB
- 실행 결과 CSV/XLSX/JSONL/log
- Python cache

`data/*/.gitkeep` 파일은 빈 폴더 구조를 유지하기 위해 포함됩니다.

## 저작권 및 접근 권한 주의

이 프로젝트는 공개 API와 공개 PDF URL만 사용합니다.

사용하는 경로:

- OpenAlex
- Unpaywall
- 논문 출판사 또는 저장소가 제공하는 공개 PDF URL

사용하지 않는 경로:

- Sci-Hub
- 비공식 PDF 다운로드 경로
- 접근 권한이 없는 유료 논문 PDF

PDF URL이 없거나 접근이 막힌 논문은 `skipped_papers.csv`에 사유를 기록하고 건너뜁니다.

## 한계 및 개선 방향

- 일부 출판사 PDF URL은 403 오류를 반환할 수 있습니다.
- open-access landing page는 있어도 직접 PDF URL이 없을 수 있습니다.
- LLM이 JSON을 잘못 생성하는 경우가 있어 JSON repair 또는 strict structured output을 추가하면 회수율을 높일 수 있습니다.
- 표가 많은 논문은 `gpt-5-nano`보다 `gpt-5-mini`가 더 안정적일 수 있습니다.
- 현재 PDF 표 구조 추출은 텍스트 기반이므로, 향후 `pdfplumber` 기반 table extraction을 추가하면 정확도가 개선될 수 있습니다.

## 테스트

핵심 chunk 페이지 추적, 근거 검증, schema 기반 데이터 내보내기는 표준 라이브러리 테스트로 확인할 수 있습니다.

```powershell
python -m unittest discover -s tests -v
```

