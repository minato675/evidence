CREATE TABLE `notices` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text DEFAULT 'notice' NOT NULL,
	`title` text NOT NULL,
	`version` text,
	`content` text NOT NULL,
	`author_email` text NOT NULL,
	`published_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notices_published_idx` ON `notices` (`published_at`);
--> statement-breakpoint
INSERT INTO `notices` (`id`, `type`, `title`, `version`, `content`, `author_email`, `published_at`, `created_at`) VALUES (
  'patch-v1-2026-08-12',
  'patch',
  'Evidence Lab 기능 통합 업데이트',
  'v1.0.0',
  '- 관리자 사용자 라이브러리 전체 열람 기능 추가\n- 등록 논문 10편 단위 빠른 페이지 전환\n- 논문별 AI 분석 완료·미분석 상태 표시\n- 상세 분석 읽기 전용 팝업 추가\n- 사용자별 및 전체 PDF 사용 용량 표시\n- 동일 논문의 최신 분석 결과 공유·동기화\n- PDF에서 논문 제목과 저널명 자동 추출\n- 공지사항 및 패치노트 페이지 추가',
  'system@evidence-lab',
  1786489200000,
  1786489200000
);
