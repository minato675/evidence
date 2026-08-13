-- Custom SQL migration file, put your code below! --
INSERT INTO `notices` (`id`, `type`, `title`, `version`, `content`, `author_email`, `published_at`, `created_at`) VALUES (
  'patch-v1-0-7-viewport-recovery',
  'patch',
  '메인 화면 비율 긴급 복구',
  'v1.0.7',
  '- 일부 브라우저에서 글자 확대 후 메인 화면 폭이 축소되던 전체 화면 확대 방식 제거\n- 글자 크기 단계가 화면 배치와 고정 요소 위치에 영향을 주지 않도록 분리\n- 글자 크기 버블을 브라우저 화면 우측 하단에 강제 고정\n- 메인 콘텐츠와 상단바가 우측의 남은 공간까지 모두 사용하도록 폭 계산 복구',
  'system@evidence-lab',
  1786496400000,
  1786496400000
);
