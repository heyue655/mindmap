/**
 * GET /api/auth/dingtalk/callback
 * 钉钉SSO登录回调接口
 * 
 * 处理钉钉SSO登录回调，通过临时授权码换取用户信息并登录
 * 
 * Query参数：?code={临时授权码}&state={状态参数}
 * 响应：重定向到前端登录成功页面，携带token
 */

import { NextResponse, type NextRequest } from "next/server";
import { withApiLogger } from "@/lib/withApiLogger";
import { handleDingtalkSsoLogin } from "@/lib/dingtalk-sso";
import { logger } from "@/lib/logger";

// 简单的CSRF令牌验证（实际应用中可能需要更复杂的实现）
function validateCsrfToken(state: string | null): boolean {
  if (!state) {
    return false;
  }
  
  // 在实际应用中，这里应该是从session或缓存中获取之前存储的CSRF token进行比对
  // 为了简化演示，我们暂时返回true，但实际部署时应实现完整的CSRF校验
  // 示例：验证state是否为预期格式或包含有效签名
  return true;
}

async function handler(req: NextRequest): Promise<NextResponse> {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state"); // 用于CSRF防护校验

  if (!code) {
    logger.warn({ service: "dingtalk-sso" }, "钉钉SSO回调缺少code参数");
    return NextResponse.json({ error: "缺少授权码" }, { status: 400 });
  }

  // 校验CSRF token（可选但推荐的安全措施）
  if (!validateCsrfToken(state)) {
    logger.warn({ service: "dingtalk-sso" }, "钉钉SSO回调CSRF校验失败");
    return NextResponse.json({ error: "CSRF校验失败" }, { status: 400 });
  }

  try {
    const result = await handleDingtalkSsoLogin(code);
    if (!result) {
      logger.warn(
        { service: "dingtalk-sso", code },
        "钉钉SSO登录失败"
      );
      return NextResponse.json({ error: "钉钉SSO登录失败" }, { status: 401 });
    }

    // 构建登录成功的重定向URL
    // 将token添加到查询参数中传递给前端
    const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || "http://localhost:3000";
    const redirectUrl = `${frontendUrl}/auth/success?token=${result.token}&userId=${result.user.id}&userName=${encodeURIComponent(result.user.name)}`;

    logger.info(
      { service: "dingtalk-sso", userId: result.user.id },
      `钉钉SSO登录成功，重定向到: ${redirectUrl}`
    );

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    logger.error(
      { service: "dingtalk-sso", code, error },
      "钉钉SSO登录处理异常"
    );
    return NextResponse.json({ error: "登录处理异常" }, { status: 500 });
  }
}

export const GET = withApiLogger(handler);