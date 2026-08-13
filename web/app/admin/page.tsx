import { getChatGPTUser } from "../chatgpt-auth";
import { isAdminEmail } from "../access-control";
import AdminClient from "./admin-client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getChatGPTUser();
  if (!user || !isAdminEmail(user.email)) {
    return <main className="access-gate"><div><a className="access-gate-logo" href="/" aria-label="Evidence Lab 메인으로"><span>EL</span></a><p>ADMIN ONLY</p><h1>관리자만 접근할 수 있습니다.</h1><a href="/">연구 화면으로 돌아가기</a></div></main>;
  }
  return <AdminClient adminEmail={user.email} />;
}
