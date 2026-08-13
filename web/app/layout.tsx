import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { getChatGPTUser } from "./chatgpt-auth";
import { isAllowedEmail } from "./access-control";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const previewImage = `${protocol}://${host}/og.png`;

  return {
    title: "Evidence Lab · 개인화 논문 수집 워크스페이스",
    description: "승인된 연구자를 위한 논문 검색, 공개 원문 확인, 근거 기반 AI 분석 워크스페이스.",
    openGraph: {
      title: "Evidence Lab",
      description: "Search papers. Keep the evidence.",
      images: [{ url: previewImage, width: 1200, height: 630, alt: "Evidence Lab research workspace" }],
    },
    twitter: { card: "summary_large_image", images: [previewImage] },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getChatGPTUser();
  let content = children;
  if (!user) {
    content = <main className="access-gate"><div><span>EL</span><p>PRIVATE RESEARCH WORKSPACE</p><h1>로그인이 필요합니다.</h1><a href="/signin-with-chatgpt?return_to=%2F">ChatGPT로 로그인</a></div></main>;
  } else if (!await isAllowedEmail(user.email)) {
    content = <main className="access-gate"><div><span>EL</span><p>ACCESS PENDING</p><h1>관리자 승인이 필요합니다.</h1><small>{user.email}</small><a href="/signout-with-chatgpt?return_to=%2F">다른 계정으로 로그인</a></div></main>;
  }
  return <html lang="ko"><body className={`${geistSans.variable} ${geistMono.variable}`}>{content}</body></html>;
}
