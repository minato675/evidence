INSERT INTO `notices` (`id`, `type`, `title`, `version`, `content`, `author_email`, `published_at`, `created_at`) VALUES (
  'patch-v1-0-11-open-access-resolver-icon-actions',
  'patch',
  '오픈액세스 원문 탐색과 논문 카드 개선',
  'v1.0.11',
  '- 직접 PDF 주소가 없어도 오픈액세스 DOI 논문을 분석 대상으로 선택할 수 있도록 개선\n- OpenAlex의 전체 공개 위치, Crossref, Unpaywall 및 출판사 원문 경로를 순차적으로 확인\n- Elsevier 논문은 DOI·PII 기반 PDF와 텍스트/XML 원문 경로를 추가 확인\n- 검증된 공개 PDF가 없으면 사용 가능한 전문 텍스트를 분석 입력으로 활용\n- 이전 검색 캐시를 갱신해 잘못 분류된 오픈액세스 상태를 다시 확인\n- 저장 논문의 상세 보기·사전 분석·삭제 버튼을 아이콘으로 바꾸고 우측에 가로 배치해 카드 높이 축소',
  'system@evidence-lab',
  1786501200000,
  1786501200000
);
