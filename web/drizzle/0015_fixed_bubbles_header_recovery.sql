-- Custom SQL migration file, put your code below! --
INSERT INTO `notices` (`id`, `type`, `title`, `version`, `content`, `author_email`, `published_at`, `created_at`) VALUES (
  'patch-v1-0-8-fixed-bubbles-header',
  'patch',
  '고정 버블과 메인 화면 레이아웃 재복구',
  'v1.0.8',
  '- 중첩된 글자 크기 규칙으로 콘텐츠가 세로로 늘어나고 깨지던 현상 제거\n- 글자 크기 조절기를 상단바 구조 밖으로 분리해 화면 우측 하단에 고정\n- 좁은 화면의 라이브러리 버튼을 상단바에서 제거하고 화면 좌측 하단 버블로 이동\n- 공통 상단바를 스크롤 위치와 관계없이 화면 상단에 고정\n- 넓은 화면에서 좌측 라이브러리를 제외한 전체 가용 폭을 본문이 사용하도록 재정렬',
  'system@evidence-lab',
  1786497000000,
  1786497000000
);
