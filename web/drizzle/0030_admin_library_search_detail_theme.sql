INSERT INTO `notices` (`id`, `type`, `title`, `version`, `content`, `author_email`, `published_at`, `created_at`) VALUES (
  'patch-v1-0-23-admin-library-search-detail-theme',
  'patch',
  '관리자 라이브러리 검색과 상세정보 개선',
  'v1.0.23',
  '- 관리자 논문 상세정보를 열 때 최신 분석 레코드를 다시 조회하도록 개선\n- 상세정보에 분석 모델, 분석 모듈 버전, 분석 시각, 최신 여부 표시\n- 사용자 이름·이메일, 라이브러리 이름, 논문 제목·DOI·저널·파일명 검색 추가\n- 검색 결과에 맞춰 등록 논문 페이지 수와 검색 건수를 즉시 갱신\n- 사용자와 라이브러리 선택창을 사이트 색상과 카드 디자인에 맞는 테마형 드롭다운으로 교체\n- 논문 ID가 달라도 제목 기준으로 연결된 기존 분석을 관리자 화면에서 동일하게 인식',
  'system@evidence-lab',
  1786600500000,
  1786600500000
);
