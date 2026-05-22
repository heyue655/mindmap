'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/store/StoreProvider';
import { setApiToken } from '@/lib/api/workspaceApi';

export default function AuthSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setCurrentUserId } = useStore();

  useEffect(() => {
    const token = searchParams.get('token');
    const userId = searchParams.get('userId');
    const userName = searchParams.get('userName');

    if (token && userId && userName) {
      // 保存token到localStorage供API使用
      setApiToken(token);
      
      // 设置当前用户ID到全局状态
      setCurrentUserId(Number(userId) as any); // 类型适配

      // 重定向到首页
      router.push('/');
      router.refresh(); // 刷新路由以更新导航栏等组件
    } else {
      // 参数不完整，重定向到登录页
      router.push('/auth/login');
    }
  }, [searchParams, setCurrentUserId, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-lg text-gray-600">正在登录中...</p>
      </div>
    </div>
  );
}