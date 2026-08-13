-- Custom SQL migration file, put your code below! --
INSERT INTO `notices` (`id`, `type`, `title`, `version`, `content`, `author_email`, `published_at`, `created_at`) VALUES (
  'patch-v1-0-6-sequential-font-controls',
  'patch',
  '글자 크기 조절과 상단 메뉴 공간 개선',
  'v1.0.6',
  '- 우측 하단 글자 크기 버블을 −·＋ 두 버튼 방식으로 단순화\n- 90%부터 130%까지 한 단계씩 순차 조절하고 현재 배율 표시\n- 글자 확대 시 전체 레이아웃 폭이 가운데로 좁아지지 않도록 화면 폭 보정\n- 상단 메뉴가 좌우 공간을 최대한 활용하도록 여백과 배치 개선',
  'system@evidence-lab',
  1786495800000,
  1786495800000
);
