import { Suspense } from 'react';
import AuthSuccessContent from './AuthSuccessContent';

export default function AuthSuccessPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">正在加载...</p>
        </div>
      </div>
    }>
      <AuthSuccessContent />
    </Suspense>
  );
}