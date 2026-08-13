-- Custom SQL migration file, put your code below! --
INSERT INTO `notices` (`id`, `type`, `title`, `version`, `content`, `author_email`, `published_at`, `created_at`) VALUES (
  'patch-v1-0-9-desktop-shell-column',
  'patch',
  '넓은 화면 본문 열 배치 수정',
  'v1.0.9',
  '- 1280px 초과 화면에서 고정 라이브러리가 그리드 흐름에서 제외되며 본문이 270px 열로 들어가던 원인 수정\n- 데스크톱 화면은 좌측 270px을 라이브러리 전용 공간으로 명시적으로 확보\n- 본문은 그리드 자동 배치 대신 남은 전체 화면 폭을 직접 사용하도록 구조 변경\n- 1280px 이하에서는 좌측 여백 없이 단일 열 레이아웃으로 전환',
  'system@evidence-lab',
  1786497600000,
  1786497600000
);
