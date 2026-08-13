# Evidence Lab Backend

OpenAlex와 Crossref에서 논문을 검색하고, 공개 PDF를 수집한 뒤 RAG와 사용자 정의 스키마를 사용해 근거가 포함된 구조화 데이터를 추출하는 Python 엔진입니다.

## 테스트

```powershell
python -m unittest discover -s tests -v
```

현재 포함된 테스트는 청크 페이지 정보, 근거 검증, 스키마 기반 내보내기, 다중 검색 공급자, OA URL 처리, 수집 재개와 중복 제거를 검증합니다.

## 환경변수

`.env.example`을 `.env`로 복사하고 필요한 값을 설정합니다. `.env`는 저장소에서 제외됩니다.

