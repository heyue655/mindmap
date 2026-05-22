'use client';

import { generateDingtalkAuthUrl } from '@/lib/dingtalk-sso';
import { Button } from '@/components/ui/button';

interface DingtalkSsoButtonProps {
  className?: string;
  variant?: 'default' | 'outline' | 'secondary';
  size?: 'default' | 'sm' | 'lg';
}

export default function DingtalkSsoButton({ 
  className, 
  variant = 'default', 
  size = 'default' 
}: DingtalkSsoButtonProps) {
  const handleLogin = () => {
    try {
      // 获取当前页面的基础URL，用于构建回调地址
      const currentBaseUrl = typeof window !== 'undefined' 
        ? `${window.location.protocol}//${window.location.host}` 
        : 'http://localhost:3000';
      
      const callbackUrl = `${currentBaseUrl}/api/auth/dingtalk/callback`;
      const authUrl = generateDingtalkAuthUrl(callbackUrl);
      
      // 重定向到钉钉授权页面
      window.location.href = authUrl;
    } catch (error) {
      console.error('钉钉SSO登录失败:', error);
      alert('钉钉SSO登录配置异常，请联系管理员');
    }
  };

  return (
    <Button
      onClick={handleLogin}
      variant={variant}
      size={size}
      className={className}
    >
      <span className="flex items-center">
        <svg
          className="w-4 h-4 mr-2"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z"
            fill="currentColor"
          />
        </svg>
        使用钉钉登录
      </span>
    </Button>
  );
}