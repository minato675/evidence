INSERT INTO `notices` (`id`, `type`, `title`, `version`, `content`, `author_email`, `published_at`, `created_at`) VALUES (
  'patch-v1-0-19-paper-detail-pdf-viewer',
  'patch',
  '논문 상세 PDF 보기 기능 추가',
  'v1.0.19',
  '- 저장 논문 상세 팝업 상단에 PDF 보기 버튼 추가\n- 업로드 논문은 로그인한 소유자만 원문 PDF를 새 탭에서 열 수 있도록 권한 확인\n- 검색 논문은 확인된 공개 PDF 주소를 우선 사용하고, 없으면 논문 페이지로 안전하게 이동\n- 저장된 PDF가 비어 있는 경우 빈 화면 대신 재업로드 안내 표시\n- PDF 응답의 파일 형식과 길이를 명시해 브라우저 PDF 뷰어 호환성 개선',
  'system@evidence-lab',
  1786510800000,
  1786510800000
);
