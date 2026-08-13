INSERT INTO `notices` (`id`, `type`, `title`, `version`, `content`, `author_email`, `published_at`, `created_at`) VALUES (
  'patch-v1-0-12-selection-analysis-feedback-upload-picker',
  'patch',
  '논문 선택과 사전분석 상태 안내 개선',
  'v1.0.12',
  '- 검색 결과 우측의 저장 선택 영역을 실제 클릭 가능한 버튼으로 수정\n- 전체 선택·해제 기능을 검색 결과 및 저장 논문 페이지 바의 체크박스로 통합\n- 사전분석 진행 중인 논문 카드에 회전 상태 아이콘과 움직이는 진행선 표시\n- 분석 실패 시 해당 논문 카드에 실패 원인, 다시 시도 및 PDF 업로드 경로 표시\n- Semantic Scholar와 arXiv 공개본 탐색을 추가해 저장소 공개 논문의 분석 성공률 개선\n- Elsevier 자동 접근 제한 시 공개 논문 페이지의 전문 텍스트 대체 경로 추가\n- 동일 사용자가 같은 DOI의 PDF를 업로드한 경우에도 최신 분석 결과를 동기화\n- 다중 업로드의 라이브러리 선택 메뉴를 Evidence Lab 테마형 메뉴로 교체',
  'system@evidence-lab',
  1786504800000,
  1786504800000
);
