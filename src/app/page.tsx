// 登录页入口（根路由 /）
// 直接渲染 LoginPage 客户端组件
import LoginPage from "@/views/LoginPage";

export const dynamic = "force-dynamic";

export default function Page() {
  return <LoginPage />;
}
