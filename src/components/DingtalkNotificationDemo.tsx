'use client';

import { useState } from 'react';
import { pushPendingDingtalkNotifs } from '@/lib/dingtalk';

interface NotificationForm {
  recipientId: string;
  title: string;
  body: string;
  linkUrl: string;
  linkDescription: string;
  linkPicUrl: string;
}

export default function DingtalkNotificationDemo() {
  const [formData, setFormData] = useState<NotificationForm>({
    recipientId: '',
    title: '任务提醒',
    body: '您有一个新的任务待处理',
    linkUrl: '',
    linkDescription: '',
    linkPicUrl: ''
  });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setResult('');

    try {
      // 发送通知
      await pushPendingDingtalkNotifs([
        {
          recipientId: parseInt(formData.recipientId),
          title: formData.title,
          body: formData.body,
          linkUrl: formData.linkUrl || undefined,
          linkDescription: formData.linkDescription || undefined,
          linkPicUrl: formData.linkPicUrl || undefined
        }
      ]);

      setResult('通知发送成功！');
    } catch (error) {
      console.error('发送通知失败:', error);
      setResult('通知发送失败，请查看控制台错误信息');
    } finally {
      setSending(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-4">钉钉通知发送测试</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            接收者ID (用户数据库ID)
          </label>
          <input
            type="number"
            name="recipientId"
            value={formData.recipientId}
            onChange={handleInputChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="输入用户ID"
          />
          <p className="mt-1 text-xs text-gray-500">必须是系统中存在的用户ID，且已绑定钉钉账号</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            通知标题
          </label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleInputChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="输入通知标题"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            通知内容
          </label>
          <textarea
            name="body"
            value={formData.body}
            onChange={handleInputChange}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="输入通知内容"
          />
        </div>

        <div className="border-t pt-4">
          <h3 className="text-lg font-medium text-gray-900 mb-2">链接消息选项（可选）</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                链接地址
              </label>
              <input
                type="url"
                name="linkUrl"
                value={formData.linkUrl}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://example.com"
              />
              <p className="mt-1 text-xs text-gray-500">如果填写，将发送链接类型的消息，用户可点击跳转</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                链接描述
              </label>
              <input
                type="text"
                name="linkDescription"
                value={formData.linkDescription}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="链接的描述文字"
              />
              <p className="mt-1 text-xs text-gray-500">如果不填写，则使用上面的通知内容作为描述</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                图片链接
              </label>
              <input
                type="url"
                name="linkPicUrl"
                value={formData.linkPicUrl}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://example.com/image.jpg"
              />
              <p className="mt-1 text-xs text-gray-500">链接消息显示的图片</p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-4 pt-4">
          <button
            type="submit"
            disabled={sending}
            className={`px-4 py-2 rounded-md text-white ${
              sending 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {sending ? '发送中...' : '发送通知'}
          </button>
          
          {result && (
            <div className={`px-4 py-2 rounded-md ${
              result.includes('成功') 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              {result}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}