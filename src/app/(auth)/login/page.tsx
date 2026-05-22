'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/store/StoreProvider';
import { setApiToken } from '@/lib/api/workspaceApi';
import DingtalkSsoButton from '@/components/DingtalkSsoButton';

export default function LoginPage() {
  const router = useRouter();
  const { setCurrentUserId } = useStore();
  const [formData, setFormData] = useState({
    employeeNo: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        // 保存token和用户信息
        setApiToken(data.token);
        setCurrentUserId(data.user.id);

        // 重定向到首页
        router.push('/');
        router.refresh();
      } else {
        setError(data.error || '登录失败');
      }
    } catch (err) {
      setError('网络错误，请稍后重试');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">工作平台</h1>
          <p className="text-gray-600 mt-2">请输入您的工号和密码</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="employeeNo" className="block text-sm font-medium text-gray-700 mb-1">
              工号
            </label>
            <input
              id="employeeNo"
              name="employeeNo"
              type="text"
              required
              value={formData.employeeNo}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              placeholder="请输入工号"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              密码
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={formData.password}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              placeholder="请输入密码"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 px-4 rounded-lg font-medium text-white ${
              loading
                ? 'bg-blue-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 transition'
            }`}
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">或</span>
            </div>
          </div>

          <div className="mt-6">
            <DingtalkSsoButton className="w-full" variant="outline" />
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-gray-600">
          <Link href="/reset-password" className="text-blue-600 hover:text-blue-800">
            忘记密码？
          </Link>
        </div>
      </div>
    </div>
  );
}