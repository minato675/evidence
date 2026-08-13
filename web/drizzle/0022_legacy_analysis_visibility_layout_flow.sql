INSERT INTO `notices` (`id`, `type`, `title`, `version`, `content`, `author_email`, `published_at`, `created_at`) VALUES (
  'patch-v1-0-15-legacy-analysis-visibility-layout-flow',
  'patch',
  '이전 분석 복원과 저장 논문 헤더 배치 개선',
  'v1.0.15',
  '- 데이터베이스에 JSON 문자열로 저장된 기존 분석을 메인 화면 호환성 검사기가 누락하던 문제 수정\n- 이전 모델 분석도 분석 완료로 표시하고 상세 내용과 라이브러리 RAG에 계속 활용\n- 논문별 분석 모델명과 분석 모듈 버전을 표시하고 구버전에는 최신화 가능 상태를 안내\n- 상세 화면을 읽기 전용으로 연 상태에서도 기존 분석을 확인하고 선택적으로 최신 분석으로 업데이트 가능\n- 최신화가 성공하기 전까지 이전 분석 데이터와 완료 상태를 유지\n- 저장 논문 제목, 라이브러리 정보·분석 버튼, 페이지 바를 독립된 흐름으로 배치해 겹침 방지',
  'system@evidence-lab',
  1786501580359,
  1786501580359
);
