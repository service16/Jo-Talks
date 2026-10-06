'use client'

import { useState } from 'react'
import { supabase } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      alert(error.message)
    } else {
      router.push('/chat') // Redirect directly to chat dashboard on success
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
      <form onSubmit={handleLogin} className="bg-gray-950 p-8 rounded-xl border border-gray-800 w-96 space-y-4 shadow-xl">
        <h2 className="text-xl font-bold text-indigo-400 text-center">Log In to Chat</h2>
        
        <div>
          <label className="text-xs text-gray-400">Email</label>
          <input 
            type="email" 
            placeholder="you@example.com" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required
            className="w-full mt-1 bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 text-white"
          />
        </div>

        <div>
          <label className="text-xs text-gray-400">Password</label>
          <input 
            type="password" 
            placeholder="••••••••" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required
            className="w-full mt-1 bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 text-white"
          />
        </div>

        <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 py-2 rounded text-sm font-semibold transition">
          Log In
        </button>

        <div className="text-center mt-4">
          <p className="text-xs text-gray-500">
            Don't have an account? <a href="/signup" className="text-indigo-400 hover:underline">Sign up</a>
          </p>
        </div>
      </form>
    </div>
  )
}
