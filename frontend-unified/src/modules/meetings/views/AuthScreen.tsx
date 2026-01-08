import { useState } from 'react';
import { Gavel, Mail, User, Hash, ArrowRight, Loader2, Calendar } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { MeetingScheduler } from '../components/scheduling';

type Step = 'login' | 'verify' | 'schedule';

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

  const handleJoinFromScheduler = (code: string) => {
    setMeetingCode(code);
    setStep('login');
  };

  // Show scheduler when in schedule step
  if (step === 'schedule') {
    return (
      <MeetingScheduler
        onBack={() => setStep('login')}
        onJoinMeeting={handleJoinFromScheduler}
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto flex items-center justify-center min-h-[60vh]">
      <div className="card w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-meeting-700 to-meeting-800 text-white p-6">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-3 rounded-xl">
              <Gavel size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Live Meeting</h1>
              <p className="text-meeting-200">Robert's Rules of Order</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="p-6">
          {step === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <h2 className="text-xl font-semibold text-secondary-800 dark:text-white mb-4">
                Join a Meeting
              </h2>

              <div>
                <label htmlFor="meetingCode" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Meeting Code
                </label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400" size={20} />
                  <input
                    id="meetingCode"
                    type="text"
                    value={meetingCode}
                    onChange={(e) => setMeetingCode(e.target.value.toUpperCase())}
                    placeholder="ABC123"
                    className="w-full pl-10 pr-4 py-3 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-900 text-secondary-900 dark:text-white focus:ring-2 focus:ring-meeting-500 focus:border-meeting-500 uppercase"
                    required
                    maxLength={8}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="name" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Your Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400" size={20} />
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full pl-10 pr-4 py-3 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-900 text-secondary-900 dark:text-white focus:ring-2 focus:ring-meeting-500 focus:border-meeting-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400" size={20} />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="w-full pl-10 pr-4 py-3 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-900 text-secondary-900 dark:text-white focus:ring-2 focus:ring-meeting-500 focus:border-meeting-500"
                    required
                  />
                </div>
                <p className="text-sm text-secondary-500 dark:text-secondary-400 mt-1">
                  We'll send a verification code to this email
                </p>
              </div>

              {error && (
                <div className="bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 text-danger-700 dark:text-danger-400 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-meeting-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-meeting-700 focus:ring-2 focus:ring-offset-2 focus:ring-meeting-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-secondary-300 dark:border-secondary-600" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white dark:bg-secondary-800 text-secondary-500">or</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setStep('schedule')}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-secondary-300 dark:border-secondary-600 rounded-lg font-medium text-secondary-700 dark:text-secondary-300 hover:bg-secondary-50 dark:hover:bg-secondary-700"
              >
                <Calendar size={20} />
                Schedule a New Meeting
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              <h2 className="text-xl font-semibold text-secondary-800 dark:text-white mb-2">
                Enter Verification Code
              </h2>
              <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                We sent a 6-digit code to <strong className="text-secondary-900 dark:text-white">{email}</strong>
              </p>

              <div>
                <label htmlFor="code" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Verification Code
                </label>
                <input
                  id="code"
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full text-center text-2xl tracking-widest py-4 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-900 text-secondary-900 dark:text-white focus:ring-2 focus:ring-meeting-500 focus:border-meeting-500"
                  required
                  maxLength={6}
                  autoComplete="one-time-code"
                />
              </div>

              {error && (
                <div className="bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 text-danger-700 dark:text-danger-400 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || verificationCode.length !== 6}
                className="w-full bg-meeting-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-meeting-700 focus:ring-2 focus:ring-offset-2 focus:ring-meeting-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                className="w-full text-secondary-600 dark:text-secondary-400 py-2 hover:text-secondary-800 dark:hover:text-secondary-200"
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
