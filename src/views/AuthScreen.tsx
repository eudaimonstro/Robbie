import { useState } from 'react';
import { Gavel, Mail, User, Hash, ArrowRight, Loader2 } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

type Step = 'login' | 'verify';

export function AuthScreen() {
  const { login, verifyCode, error } = useSocket();
  const [step, setStep] = useState<Step>('login');
  const [isLoading, setIsLoading] = useState(false);

  // Login form state
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [meetingCode, setMeetingCode] = useState('');

  // Verification form state
  const [verificationCode, setVerificationCode] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email, name, meetingCode);
      setStep('verify');
    } catch {
      // Error is handled by context
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const success = await verifyCode(verificationCode);
      if (!success) {
        setVerificationCode('');
      }
      // If successful, SocketContext will handle connection
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-700 to-indigo-800 text-white p-6">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-3 rounded-xl">
              <Gavel size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Parliamentary Procedure</h1>
              <p className="text-indigo-200">Robert's Rules of Order</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="p-6">
          {step === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Join a Meeting
              </h2>

              <div>
                <label htmlFor="meetingCode" className="block text-sm font-medium text-gray-700 mb-1">
                  Meeting Code
                </label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    id="meetingCode"
                    type="text"
                    value={meetingCode}
                    onChange={(e) => setMeetingCode(e.target.value.toUpperCase())}
                    placeholder="ABC123"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 uppercase"
                    required
                    maxLength={8}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Your Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  />
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  We'll send a verification code to this email
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Sending Code...
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight size={20} />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                Enter Verification Code
              </h2>
              <p className="text-gray-600 mb-4">
                We sent a 6-digit code to <strong>{email}</strong>
              </p>

              <div>
                <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
                  Verification Code
                </label>
                <input
                  id="code"
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full text-center text-2xl tracking-widest py-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                  maxLength={6}
                  autoComplete="one-time-code"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || verificationCode.length !== 6}
                className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    Join Meeting
                    <ArrowRight size={20} />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setStep('login')}
                className="w-full text-gray-600 py-2 hover:text-gray-800"
              >
                Back to login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
