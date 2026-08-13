# Evidence Lab Web

현재 배포된 Evidence Lab Sites 프로젝트의 웹 소스입니다.

## 포함된 화면

- 메인 논문 검색 및 개인 라이브러리
- 다중 PDF 업로드
- 논문 상세 분석과 근거 카드
- 소재 조성·물성 데이터 표
- 라이브러리 기반 RAG 질의
- 사용법, 공지사항, 마이페이지
- 사용자 승인과 이용량을 관리하는 관리자 페이지

## 로컬 실행

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

## 검증

```powershell
npm run build
npm test
```

## 배포 연결

`.openai/hosting.json`은 현재 Evidence Lab Sites 프로젝트의 D1·R2 및 프로젝트 연결 정보를 유지합니다. 별도의 Sites 서비스로 복제할 때는 새 프로젝트 정보로 교체해야 합니다.

