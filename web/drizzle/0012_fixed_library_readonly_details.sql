-- Custom SQL migration file, put your code below! --
INSERT INTO `notices` (`id`, `type`, `title`, `version`, `content`, `author_email`, `published_at`, `created_at`) VALUES (
  'patch-v1-0-5-library-detail-layout',
  'patch',
  '라이브러리와 논문 상세 화면 개선',
  'v1.0.5',
  '- 데스크톱 좌측 라이브러리를 스크롤 위치와 무관하게 상단바 아래에 고정\n- 저장 논문 목록을 논문 제목 중심의 간결한 카드로 변경\n- 논문 상세 화면을 기본 읽기 전용으로 열고 상단 편집 버튼을 눌러야 수정 가능\n- 편집 취소 시 변경 전 내용으로 복원\n- 연구 화면 구역 순서를 검색 결과 01·저장 논문 02·AI 분석 03·물성표 04로 정리\n- 저장 논문과 AI 분석 작업 영역의 폭과 높이 균형 조정\n- 글자 크기 조절기를 우측 하단 고정 버블로 이동',
  'system@evidence-lab',
  1786495200000,
  1786495200000
);
