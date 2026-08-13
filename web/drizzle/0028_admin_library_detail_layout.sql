INSERT INTO `notices` (`id`, `type`, `title`, `version`, `content`, `author_email`, `published_at`, `created_at`) VALUES (
  'patch-v1-0-21-admin-library-detail-layout',
  'patch',
  '관리자 사용자 라이브러리 화면 개편',
  'v1.0.21',
  '- 관리자 화면의 사용자와 라이브러리 선택을 드롭다운 방식으로 변경\n- 등록 논문 목록을 고정 높이와 내부 스크롤 구조로 변경해 긴 페이지 이동 최소화\n- 등록 논문은 페이지당 10편을 유지하면서 제목과 분석 상태를 간결하게 표시\n- 관리자 논문 상세 화면을 메인 화면과 같은 논문 정보 필드 구성으로 통일\n- 관리자 상세 화면에서 PDF 보기, 분석 요약, 근거 카드, JSON 원본을 읽기 전용으로 확인 가능',
  'system@evidence-lab',
  1786513800000,
  1786513800000
);
