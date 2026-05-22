/**
 * 钉钉单点登录(SSO)服务层
 *
 * 功能：
 *  1. generateAuthUrl - 生成钉钉授权URL
 *  2. getUserByCode - 通过临时授权码获取钉钉用户信息
 *  3. handleSsoLogin - 处理SSO登录流程，返回JWT token
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";

/**
 * 生成钉钉SSO授权URL
 * @param redirectUri 回调地址
 * @param state 附加状态参数（建议包含csrf token）
 */
export function generateDingtalkAuthUrl(redirectUri: string, state?: string): string {
  const appId = process.env.DINGTALK_APP_ID;
  if (!appId) {
    throw new Error("环境变量 DINGTALK_APP_ID 未配置");
  }

  const encodedRedirectUri = encodeURIComponent(redirectUri);
  const baseUrl = "https://oapi.dingtalk.com/connect/qrconnect";
  
  let url = `${baseUrl}?appid=${appId}&response_type=code&scope=snsapi_login&state=${encodedRedirectUri}`;
  if (state) {
    url += `&state=${encodeURIComponent(state)}`;
  }
  
  return url;
}

/**
 * 通过临时授权码获取钉钉用户信息
 * @param code 临时授权码
 */
export async function getUserByCode(code: string): Promise<{ 
  userid: string; 
  name: string; 
  employeeNo?: string; 
} | null> {
  const appId = process.env.DINGTALK_APP_ID;
  const appSecret = process.env.DINGTALK_APP_SECRET;
  
  if (!appId || !appSecret) {
    logger.error({ service: "dingtalk-sso" }, "DINGTALK_APP_ID 或 DINGTALK_APP_SECRET 未配置");
    return null;
  }

  try {
    // 第一步：获取用户的临时授权码
    const snsTokenUrl = `https://oapi.dingtalk.com/sns/get_sns_token?access_token=${await getDingtalkToken()}`;
    const snsTokenRes = await fetch(snsTokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tmp_auth_code: code
      })
    });
    
    const snsTokenData = await snsTokenRes.json();
    if (snsTokenData.errcode !== 0) {
      logger.warn(
        { service: "dingtalk-sso", code },
        `获取sns_token失败：errcode=${snsTokenData.errcode} errmsg=${snsTokenData.errmsg}`
      );
      return null;
    }
    
    const snsToken = snsTokenData.sns_token;
    
    // 第二步：获取用户个人信息
    const userInfoUrl = `https://oapi.dingtalk.com/sns/getuserinfo_bycode?access_token=${await getDingtalkToken()}`;
    const userInfoRes = await fetch(userInfoUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sns_token: snsToken
      })
    });
    
    const userInfoData = await userInfoRes.json();
    if (userInfoData.errcode !== 0) {
      logger.warn(
        { service: "dingtalk-sso", code },
        `获取用户信息失败：errcode=${userInfoData.errcode} errmsg=${userInfoData.errmsg}`
      );
      return null;
    }
    
    const userId = userInfoData.user_info.openid; // 这是用户的唯一标识
    
    // 第三步：通过openid获取钉钉内部userid（如果需要获取更多用户信息）
    const userIdByUnionIdUrl = `https://oapi.dingtalk.com/topapi/user/getbyunionid?access_token=${await getDingtalkToken()}`;
    const userIdByUnionIdRes = await fetch(userIdByUnionIdUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        unionid: userInfoData.user_info.unionid
      })
    });
    
    const userIdByUnionIdData = await userIdByUnionIdRes.json();
    if (userIdByUnionIdData.errcode !== 0) {
      logger.warn(
        { service: "dingtalk-sso", unionid: userInfoData.user_info.unionid },
        `获取钉钉内部userid失败：errcode=${userIdByUnionIdData.errcode} errmsg=${userIdByUnionIdData.errmsg}`
      );
      // 如果获取不到内部userid，就使用openid作为唯一标识
      return {
        userid: userId,
        name: userInfoData.user_info.nick || "未知用户",
      };
    }
    
    const internalUserId = userIdByUnionIdData.result.userid;
    
    // 获取详细用户信息
    const { getDingtalkUserDetail } = await import("@/lib/dingtalk");
    const userDetail = await getDingtalkUserDetail(internalUserId);
    
    return {
      userid: internalUserId,
      name: userDetail?.name || userInfoData.user_info.nick || "未知用户",
      employeeNo: userDetail?.jobNumber
    };
    
  } catch (err) {
    logger.error(
      { service: "dingtalk-sso", code, err },
      "通过code获取用户信息异常"
    );
    return null;
  }
}

/**
 * 获取钉钉access_token的辅助函数（复用现有逻辑）
 */
async function getDingtalkToken(): Promise<string> {
  // 由于我们已经在dingtalk.ts中实现了token缓存逻辑
  // 这里简单实现，实际项目中应该复用那个模块
  const appKey = process.env.DINGTALK_APP_KEY;
  const appSecret = process.env.DINGTALK_APP_SECRET;

  if (!appKey || !appSecret) {
    throw new Error("DINGTALK_APP_KEY 或 DINGTALK_APP_SECRET 未配置");
  }

  try {
    const url = `https://oapi.dingtalk.com/gettoken?appkey=${encodeURIComponent(appKey)}&appsecret=${encodeURIComponent(appSecret)}`;
    const res = await fetch(url, { method: "GET" });
    const data = (await res.json()) as {
      errcode: number;
      errmsg: string;
      access_token?: string;
    };

    if (data.errcode !== 0 || !data.access_token) {
      throw new Error(`获取钉钉 access_token 失败：errcode=${data.errcode} errmsg=${data.errmsg}`);
    }

    return data.access_token;
  } catch (err) {
    logger.error({ service: "dingtalk-sso", err }, "请求钉钉 access_token 异常");
    throw err;
  }
}

/**
 * 处理钉钉SSO登录流程
 * @param code 临时授权码
 * @returns 登录成功返回 { token, user }，失败返回 null
 */
export async function handleDingtalkSsoLogin(code: string) {
  // 通过code获取钉钉用户信息
  const dingtalkUser = await getUserByCode(code);
  if (!dingtalkUser) {
    logger.warn({ service: "dingtalk-sso" }, `获取钉钉用户信息失败，code: ${code}`);
    return null;
  }

  // 根据钉钉userid查找本地用户
  let user = await prisma.user.findFirst({
    where: { 
      dingtalkUserId: dingtalkUser.userid 
    },
    select: {
      id: true,
      name: true,
      employeeNo: true,
      status: true
    }
  });

  // 如果未找到对应用户，尝试通过工号匹配
  if (!user && dingtalkUser.employeeNo) {
    user = await prisma.user.findFirst({
      where: {
        employeeNo: dingtalkUser.employeeNo,
        dingtalkUserId: null // 确保未被其他钉钉账号绑定
      },
      select: {
        id: true,
        name: true,
        employeeNo: true,
        status: true
      }
    });

    // 如果找到了匹配的工号用户，更新其钉钉userid
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { dingtalkUserId: dingtalkUser.userid }
      });
      logger.info(
        { service: "dingtalk-sso", userId: user.id },
        `绑定钉钉用户 ${dingtalkUser.userid} 到本地用户 ${user.employeeNo}`
      );
    }
  }

  // 如果仍然找不到用户，返回错误
  if (!user) {
    logger.warn(
      { service: "dingtalk-sso" },
      `未找到匹配的本地用户，钉钉userid: ${dingtalkUser.userid}, 姓名: ${dingtalkUser.name}`
    );
    return null;
  }

  // 检查用户状态
  if (user.status === "disabled") {
    logger.warn(
      { service: "dingtalk-sso", userId: user.id },
      `用户已禁用，无法登录：${user.name}（${user.employeeNo}）`
    );
    return null;
  }

  // 生成JWT token
  const token = await signToken({
    userId: user.id,
    employeeNo: user.employeeNo,
  });

  logger.info(
    { service: "dingtalk-sso", userId: user.id },
    `钉钉SSO登录成功：${user.name}（${user.employeeNo}）`
  );

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      employeeNo: user.employeeNo
    }
  };
}