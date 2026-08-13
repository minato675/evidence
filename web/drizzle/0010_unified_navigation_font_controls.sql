-- Custom SQL migration file, put your code below! --
INSERT INTO `notices` (`id`, `type`, `title`, `version`, `content`, `author_email`, `published_at`, `created_at`) VALUES (
  'patch-v1-0-3-navigation-type',
  'patch',
  '공통 메뉴와 화면 가독성 개선',
  'v1.0.3',
  '- 모든 화면의 상단 메뉴를 메인페이지·다중 업로드·사용법·공지사항으로 통일\n- 중복된 메인으로 돌아가기 버튼과 페이지별 보조 메뉴 제거\n- 메인 화면 검색·업로드·현황 박스의 폭 기준 통일\n- 데스크톱과 모바일에서 글자 크기를 작게·기본·크게로 조절하고 선택값 저장',
  'system@evidence-lab',
  1786492800000,
  1786492800000
);
