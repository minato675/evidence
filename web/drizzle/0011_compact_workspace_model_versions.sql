-- Custom SQL migration file, put your code below! --
INSERT INTO `notices` (`id`, `type`, `title`, `version`, `content`, `author_email`, `published_at`, `created_at`) VALUES (
  'patch-v1-0-4-compact-model-version',
  'patch',
  '분석 버전 표시와 연구 화면 동선 개선',
  'v1.0.4',
  '- 페이지 진입 시 저장 라이브러리와 채팅 기록 때문에 스크롤이 자동 이동하던 현상 제거\n- 저장한 논문 구역 상단에 현재 최신 전문 분석 모델과 분석 모듈 버전 표시\n- 분석 완료 논문마다 실제 분석 모델과 모듈 버전 표시\n- 이전 모델로 분석한 논문을 최신 분석 대상으로 자동 구분\n- 데스크톱에서 저장 논문과 AI 분석을 나란히 배치하고 목록·표 내부 스크롤로 세로 이동 축소',
  'system@evidence-lab',
  1786494000000,
  1786494000000
);
