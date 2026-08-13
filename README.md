# Evidence Lab

근거 기반 논문 검색, 공개 원문 수집, PDF 분석, 소재 물성 데이터 구조화를 하나의 연구 흐름으로 연결하는 프로젝트입니다.

## 저장소 구조

```text
evidence-lab/
├─ backend/                 # Python 논문 수집·RAG·구조화 추출 엔진
│  ├─ configs/             # 검색·추출 스키마와 모델 설정
│  ├─ data/                # 로컬 실행 데이터(내용은 Git에서 제외)
│  ├─ src/                 # 수집, PDF 처리, 검색, 검증, 내보내기
│  ├─ tests/               # 단위 테스트
│  ├─ main.py
│  └─ requirements.txt
├─ web/                     # React/Vinext 기반 Sites 웹 애플리케이션
├─ docs/                    # 공개 전 점검 및 포트폴리오 문서
└─ .gitignore
```

## 핵심 기능

- OpenAlex·Crossref 기반 학술 논문 검색
- Unpaywall·OpenAlex 기반 공개 PDF 경로 확인
- 중단 후 재개할 수 있는 OA 논문 수집과 DOI 중복 제거
- PDF 텍스트 추출, 청크 생성, 임베딩 검색
- 스키마 기반 조성·공정·기계적 물성 추출
- 근거 문장과 원문 페이지 검증
- CSV·JSONL·Excel 데이터 내보내기
- 사용자 접근 제어와 연구 컬렉션 관리용 웹 UI

## 빠른 시작

### Python 엔진

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python -m unittest discover -s tests -v
```

`.env`에 실제 API 키를 입력합니다. 실제 키는 Git에 포함되지 않습니다.

```powershell
python main.py --topic "MAX phase oxidation resistance Cr2AlC" --max_papers 10
```

### 웹 앱

```powershell
cd web
npm install
Copy-Item .env.example .env
npm run dev
```

## 배포 소스 동기화

`web/`은 현재 배포된 Evidence Lab Sites 버전 74의 소스와 동기화되어 있습니다. 동기화 기준 커밋과 확인 항목은 [docs/SOURCE_SYNC.md](docs/SOURCE_SYNC.md)에 기록합니다.

GitHub 공개 전 점검 항목은 [docs/REPOSITORY_CHECKLIST.md](docs/REPOSITORY_CHECKLIST.md)를 참고하세요.

