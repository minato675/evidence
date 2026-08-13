import { getChatGPTUser } from "../chatgpt-auth";
import { isAdminEmail } from "../access-control";
import NoticesClient from "./notices-client";

export const dynamic = "force-dynamic";

export default async function NoticesPage() {
  const user = await getChatGPTUser();
  return <NoticesClient isAdmin={Boolean(user && isAdminEmail(user.email))} />;
}
