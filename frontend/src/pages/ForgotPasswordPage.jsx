import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building2 } from 'lucide-react'
import { authAPI } from '../services/api'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [channel, setChannel] = useState('email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (channel === 'sms') {
        await authAPI.requestPasswordResetSMS(phone)
        // SMS OTP needs a second step (code entry) — email just tells the user to check
        // their inbox, so only SMS moves on to a follow-up page.
        navigate('/verify-reset-code', { state: { phone } })
        return
      }
      await authAPI.requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-8">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Building2 size={18} className="text-white" />
            </div>
            <span className="text-lg font-bold text-gray-800">RealEstate Suite</span>
          </div>

          <h2 className="text-2xl font-bold text-gray-800 mb-1">Forgot password?</h2>
          <p className="text-gray-500 text-sm mb-6">
            {channel === 'email'
              ? "Enter your account email and we'll send you a link to reset your password."
              : "Enter your account phone number and we'll text you a reset code."}
          </p>

          {!sent && (
            <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-lg text-sm font-medium">
              <button type="button" onClick={() => setChannel('email')}
                className={`flex-1 py-2 rounded-md transition-colors ${channel === 'email' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>
                Email
              </button>
              <button type="button" onClick={() => setChannel('sms')}
                className={`flex-1 py-2 rounded-md transition-colors ${channel === 'sms' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>
                SMS
              </button>
            </div>
          )}

          {sent ? (
            <div className="p-4 rounded-lg bg-green-50 border border-green-100 text-green-700 text-sm">
              If an account with that email exists, a password reset link has been sent. Check your inbox.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {channel === 'email' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 rounded-lg border border-gray-200 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    placeholder="0771234567"
                    className="w-full px-4 py-3 rounded-lg border border-gray-200 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              )}

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Sending...' : channel === 'email' ? 'Send reset link' : 'Send reset code'}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-gray-500">
            <Link to="/login" className="text-blue-600 hover:underline">Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
