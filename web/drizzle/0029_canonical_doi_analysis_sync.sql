INSERT INTO `notices` (`id`, `type`, `title`, `version`, `content`, `author_email`, `published_at`, `created_at`) VALUES (
  'patch-v1-0-22-canonical-doi-analysis-sync',
  'patch',
  '동일 DOI 분석 동기화 및 분석 정보 개선',
  'v1.0.22',
  '- 동일 DOI에 사용 가능한 사전분석이 있으면 다른 사용자 라이브러리에서도 결과를 그대로 동기화해 재분석 토큰을 사용하지 않도록 개선\n- 동일 DOI에 여러 분석 결과가 남아 있으면 최초의 최신 형식 결과를 기준으로 일관되게 동기화\n- 구버전 분석도 완료 상태와 기존 내용을 유지하고 사용자가 명시적으로 최신화를 요청할 때만 새 분석 수행\n- 업로드 화면에서 기존 분석 동기화 여부, 모델, 모듈 버전, 토큰 0 사용을 표시\n- 논문 상세정보에 분석 모델, 분석 모듈 버전, 분석 시각, 최신 여부와 최신화 버튼 추가',
  'system@evidence-lab',
  1786598480000,
  1786598480000
);
